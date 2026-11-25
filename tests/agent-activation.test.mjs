import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createActivationServer } from '../services/agent-activation/server.mjs';

test('the owner issues codes, and only the first redeeming identity can use a code', async (t) => {
  const owner = generateSecretKey();
  const first = generateSecretKey();
  const other = generateSecretKey();
  const publicBase = 'https://example.org/agent-activation';
  let now = 1800000000;
  const server = createActivationServer({ publicBase, owner: getPublicKey(owner), encryptionKey: Buffer.alloc(32, 7), database: ':memory:', clock: () => now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const local = `http://127.0.0.1:${server.address().port}/agent-activation`;
  const request = (action, input, identity) => {
    const body = JSON.stringify(input);
    const payload = createHash('sha256').update(body).digest('hex');
    const proof = finalizeEvent({ kind: 27235, created_at: now, content: '', tags: [
      ['u', `${publicBase}/${action}`], ['method', 'POST'], ['payload', payload], ['nonce', randomUUID()],
    ] }, identity);
    const headers = { 'content-type': 'application/json', authorization: `Nostr ${Buffer.from(JSON.stringify(proof)).toString('base64')}` };
    return (modified = body) => fetch(`${local}/${action}`, { method: 'POST', body: modified, headers });
  };
  assert.equal((await request('manage', {}, other)()).status, 403);
  assert.equal((await request('manage', {}, owner)()).status, 200);
  const model = { address: 'https://example.org/v1', key: 'example-key', model: 'example-model' };
  assert.equal((await request('issue', model, other)()).status, 403);
  const issue = request('issue', model, owner);
  assert.equal((await issue(JSON.stringify({ ...model, model: 'changed' }))).status, 401);
  const issued = await issue();
  assert.equal(issued.status, 200);
  const { code, expiresAt } = await issued.json();
  assert.equal((await issue()).status, 409);
  const redeemed = await request('redeem', { code }, first)();
  assert.equal(redeemed.status, 200);
  assert.deepEqual(await redeemed.json(), model);
  assert.equal((await request('redeem', { code }, other)()).status, 404);
  assert.equal((await request('redeem', { code }, first)()).status, 200);
  now = expiresAt;
  assert.equal((await request('redeem', { code }, first)()).status, 404);
});
