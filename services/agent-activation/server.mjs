import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { verifyEvent } from 'nostr-tools/pure';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const keyPattern = /^[a-f0-9]{64}$/;
const lifetime = 7 * 24 * 3600;

function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

function keyFromHeader(header, url, body, now) {
  if (typeof header !== 'string' || !/^Nostr [A-Za-z0-9+/=]+$/.test(header) || header.length > 4096)
    throw httpError(401, 'identity_required');
  try {
    const event = JSON.parse(Buffer.from(header.slice(6), 'base64').toString('utf8'));
    if (event.kind !== 27235 || event.content !== '' || !Number.isSafeInteger(event.created_at) ||
      Math.abs(event.created_at - now) > 60 || !keyPattern.test(event.pubkey) || !verifyEvent(event))
      throw new Error('invalid identity');
    for (const [name, value] of [['u', url], ['method', 'POST'], ['payload', digest(body)]]) {
      const matches = event.tags.filter((tag) => tag[0] === name);
      if (matches.length !== 1 || matches[0][1] !== value) throw new Error('invalid request proof');
    }
    return event;
  } catch {
    throw httpError(401, 'invalid_identity');
  }
}

function connection(input) {
  const { address, key, model } = input ?? {};
  if (typeof address !== 'string' || address.length > 2048 || typeof key !== 'string' ||
    !/^[\x21-\x7e]{1,4096}$/.test(key) || typeof model !== 'string' ||
    model.length > 200 || !model.trim() || /[\x00-\x1f\x7f]/.test(model))
    throw httpError(400, 'invalid_connection');
  const url = URL.parse(address);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw httpError(400, 'invalid_connection');
  return { address: url.href, key, model: model.trim() };
}

export function createActivationServer({ publicBase, owner, encryptionKey, database, clock = () => Math.floor(Date.now() / 1000) }) {
  const endpoint = new URL(publicBase);
  if (!keyPattern.test(owner) || encryptionKey.length !== 32 || endpoint.protocol !== 'https:' ||
    endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error('Invalid activation service configuration');
  const base = endpoint.href.replace(/\/$/, '');
  const basePath = endpoint.pathname.replace(/\/$/, '');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, sealed BLOB NOT NULL, expiry INTEGER NOT NULL, redeemed_by TEXT);
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, expiry INTEGER NOT NULL);`);
  const insertCode = db.prepare('INSERT INTO codes (hash, sealed, expiry) VALUES (?, ?, ?)');
  const takeCode = db.prepare(`UPDATE codes SET redeemed_by = ?
    WHERE hash = ? AND expiry > ? AND (redeemed_by IS NULL OR redeemed_by = ?) RETURNING sealed`);
  const clearCodes = db.prepare('DELETE FROM codes WHERE expiry <= ?');
  const clearRequests = db.prepare('DELETE FROM requests WHERE expiry <= ?');
  const recordRequest = db.prepare('INSERT OR IGNORE INTO requests (id, expiry) VALUES (?, ?)');

  const seal = (hash, value) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(Buffer.from(hash));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  };
  const open = (hash, stored) => {
    const data = Buffer.from(stored);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(hash));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]));
  };

  const server = createServer({ requestTimeout: 10000 }, async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET' && req.url === `${basePath}/healthz`) return reply(200, { ok: true });
    const action = req.url?.slice(basePath.length + 1);
    if (req.method !== 'POST' || req.url !== `${basePath}/${action}` || !['manage', 'issue', 'redeem'].includes(action))
      return reply(404, { error: 'not_found' });
    try {
      const parts = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 8192) throw httpError(413, 'body_too_large');
        parts.push(chunk);
      }
      const body = Buffer.concat(parts);
      const now = clock();
      const proof = keyFromHeader(req.headers.authorization, `${base}/${action}`, body, now);
      if (action !== 'redeem' && proof.pubkey !== owner) throw httpError(403, 'management_forbidden');
      clearRequests.run(now);
      if (!recordRequest.run(proof.id, now + 121).changes) throw httpError(409, 'request_replayed');
      let input;
      try { input = JSON.parse(body.toString('utf8')); }
      catch { throw httpError(400, 'invalid_request'); }
      if (action === 'manage') return reply(200, { allowed: true });
      clearCodes.run(now);
      if (action === 'issue') {
        const value = connection(input);
        const code = randomBytes(20).toString('base64url');
        const hash = digest(code);
        const expiresAt = now + lifetime;
        insertCode.run(hash, seal(hash, value), expiresAt);
        return reply(200, { code, expiresAt });
      }
      const code = typeof input?.code === 'string' && input.code.trim();
      if (!code || !/^[A-Za-z0-9_-]{27}$/.test(code)) throw httpError(404, 'invalid_code');
      const hash = digest(code);
      const row = takeCode.get(proof.pubkey, hash, now, proof.pubkey);
      if (!row) throw httpError(404, 'invalid_code');
      return reply(200, open(hash, row.sealed));
    } catch (error) {
      return reply(error.status ?? 500, { error: error.code ?? 'service_unavailable' });
    }
  });
  server.once('close', () => db.close());
  return server;
}
