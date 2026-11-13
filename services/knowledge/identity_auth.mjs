// Native Buzz event verification. No private identity keys are accepted here.
// Owner-tag format follows block/buzz-app v1.0.1 owner-attestation.ts (MIT).
import { createHash, webcrypto } from 'node:crypto';
import { verifyEvent } from 'nostr-tools/pure';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from 'nostr-tools/utils';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
export const AUDIENCE = 'https://shangliangshan.paolab.cn/opcb-plugins/knowledge/api/v2';
const KEY = /^[0-9a-f]{64}$/;
const refuse = () => { throw new Error('Identity proof refused'); };
export const sha = value => createHash('sha256').update(value).digest('hex');
export function publicKey(value) {
  if (!value || value.kty !== 'EC' || value.crv !== 'P-256' || !/^[A-Za-z0-9_-]{43}$/.test(value.x || '') || !/^[A-Za-z0-9_-]{43}$/.test(value.y || '') || 'd' in value) refuse();
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
}
export const fingerprint = value => sha(JSON.stringify(publicKey(value)));
function conditionsAllow(text, event) {
  if (text === '') return true;
  return typeof text === 'string' && text.split('&').every(clause => {
    const match = /^(kind=|created_at<|created_at>)(0|[1-9][0-9]*)$/.exec(clause);
    if (!match) return false;
    const n = Number(match[2]);
    if (!Number.isSafeInteger(n) || n > (match[1] === 'kind=' ? 65535 : 4294967295)) return false;
    return match[1] === 'kind=' ? event.kind === n : match[1] === 'created_at<' ? event.created_at < n : event.created_at > n;
  });
}
export function authorizeBinding(event, community, now = Math.floor(Date.now() / 1000)) {
  if (!event || !KEY.test(community) || ![30023, 45010].includes(event.kind) || !KEY.test(event.pubkey || '') || !Number.isSafeInteger(event.created_at) || Math.abs(now - event.created_at) > 90 || !Array.isArray(event.tags) || event.tags.length > 32 || typeof event.content !== 'string' || Buffer.byteLength(event.content) > 4096 || !verifyEvent(JSON.parse(JSON.stringify(event)))) refuse();
  let value; try { value = JSON.parse(event.content); } catch { refuse(); }
  if (value?.version !== 1 || value.purpose !== 'opcb.knowledge.device-binding' || value.audience !== AUDIENCE || value.community !== community || !KEY.test(value.nonce || '') || !['read','manage'].includes(value.role) || Object.keys(value).sort().join(',') !== 'audience,community,deviceKey,nonce,purpose,role,version') refuse();
  const deviceKey = publicKey(value.deviceKey);
  const tags = event.tags.filter(t => t[0] === 'auth');
  let owner = event.pubkey;
  if (tags.length) {
    const tag = tags[0];
    if (tags.length !== 1 || tag.length !== 4 || !KEY.test(tag[1] || '') || tag[1] === event.pubkey || !/^[a-f0-9]{128}$/.test(tag[3] || '') || !conditionsAllow(tag[2], event)) refuse();
    const digest = sha(`nostr:agent-auth:${event.pubkey}:${tag[2]}`);
    if (!schnorr.verify(hexToBytes(tag[3]), hexToBytes(digest), hexToBytes(tag[1]))) refuse();
    owner = tag[1];
  }
  // Only a personally signed binding can be used by the administration panel.
  if (value.role === 'manage' && owner !== event.pubkey) refuse();
  return { owner, actor: event.pubkey, community, proof_id: event.id, delegated: owner !== event.pubkey, role: value.role,
    nonce: value.nonce, deviceKey, device: fingerprint(deviceKey) };
}
export async function authorizeRequest(input, now = Math.floor(Date.now() / 1000)) {
  const { proof, publicKey: key, body, action } = input;
  if (!['read', 'permissions', 'policy'].includes(action) || typeof body !== 'string' || Buffer.byteLength(body) > 8192 || !proof || Object.keys(proof).sort().join(',') !== 'device,nonce,signature,timestamp' || proof.device !== fingerprint(key) || !KEY.test(proof.nonce || '') || !Number.isSafeInteger(proof.timestamp) || Math.abs(now - proof.timestamp) > 60 || !/^[A-Za-z0-9_-]{86}$/.test(proof.signature || '')) refuse();
  const message = JSON.stringify(['opcb.knowledge.request.v1', `${AUDIENCE}/${action}`, body, proof.nonce, proof.timestamp]);
  const imported = await webcrypto.subtle.importKey('jwk', publicKey(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, Buffer.from(proof.signature, 'base64url'), Buffer.from(message))) refuse();
  return { nonce: proof.nonce, device: proof.device, request_id: sha(message), created_at: proof.timestamp };
}
export async function main() {
  try {
    const parts = []; let size = 0;
    for await (const p of process.stdin) { size += p.length; if (size > 32768) refuse(); parts.push(p); }
    const input = JSON.parse(Buffer.concat(parts).toString('utf8'));
    const result = input.operation === 'bind' ? authorizeBinding(input.event, input.community) : input.operation === 'request' ? await authorizeRequest(input) : refuse();
    process.stdout.write(JSON.stringify(result));
  } catch { process.stdout.write('{"error":"Identity proof refused"}'); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
