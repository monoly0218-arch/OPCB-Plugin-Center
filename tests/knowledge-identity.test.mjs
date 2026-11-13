import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hexToBytes } from 'nostr-tools/utils';
import { AUDIENCE, authorizeBinding, authorizeRequest, sha, fingerprint } from '../services/knowledge/identity_auth.mjs';

const community = 'c'.repeat(64);
async function fixture() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const key = await webcrypto.subtle.exportKey('jwk', keys.publicKey);
  const now = Math.floor(Date.now()/1000), ownerKey = generateSecretKey(), agentKey = generateSecretKey();
  const content = JSON.stringify({ version: 1, purpose: 'opcb.knowledge.device-binding', audience: AUDIENCE, community, deviceKey: key, nonce: 'a'.repeat(64), role:'read' });
  const personal = finalizeEvent({ kind: 45010, created_at: now, tags: [['h','private-channel'],['type','opcb.knowledge.identity']], content }, ownerKey);
  const makeAgent = (conditions = '') => {
    const tag = ['auth', getPublicKey(ownerKey), conditions, Buffer.from(schnorr.sign(hexToBytes(sha(`nostr:agent-auth:${getPublicKey(agentKey)}:${conditions}`)), ownerKey)).toString('hex')];
    return finalizeEvent({ kind: 30023, created_at: now, tags: [['d','knowledge-device'],tag], content }, agentKey);
  };
  return { keys, key, ownerKey, agentKey, personal, makeAgent, now };
}

test('personal identity and independent agent resolve to the same proven owner', async () => {
  const f = await fixture(), human = authorizeBinding(f.personal, community), agent = authorizeBinding(f.makeAgent(), community);
  assert.equal(human.owner, agent.owner); assert.equal(human.delegated, false); assert.equal(agent.delegated, true);
  assert.equal(agent.actor, getPublicKey(f.agentKey)); assert.notEqual(agent.actor, agent.owner);
  assert.equal(human.device, fingerprint(f.key));
});
test('ownership claims, invalid signatures, wrong audience/community and expired proofs are refused', async () => {
  const f = await fixture();
  for (const bad of [
    { ...f.personal, sig: '0'.repeat(128) },
    { ...f.personal, content: f.personal.content.replace(AUDIENCE,'https://other.invalid') },
    { ...f.personal, pubkey: getPublicKey(f.agentKey) },
    { ...f.makeAgent(), tags: [['auth',getPublicKey(f.ownerKey),'','0'.repeat(128)]] },
  ]) assert.throws(() => authorizeBinding(bad, community));
  assert.throws(() => authorizeBinding(f.personal, 'd'.repeat(64)));
  assert.throws(() => authorizeBinding(f.personal, community, f.now + 91));
  assert.throws(() => authorizeBinding(f.makeAgent('kind=9'), community));
  assert.throws(() => authorizeBinding(f.makeAgent(`created_at<${f.now}`), community));
});
test('each automatic request signature binds device, body, endpoint and timestamp', async () => {
  const f = await fixture(), body = JSON.stringify({ request: { op: 'catalog' } }), nonce = 'e'.repeat(64);
  const data = JSON.stringify(['opcb.knowledge.request.v1',`${AUDIENCE}/read`,body,nonce,f.now]);
  const signature = Buffer.from(await webcrypto.subtle.sign({ name:'ECDSA',hash:'SHA-256' }, f.keys.privateKey, Buffer.from(data))).toString('base64url');
  const input = { proof: { device:fingerprint(f.key),nonce,signature,timestamp:f.now }, publicKey:f.key,body,action:'read' };
  assert.equal((await authorizeRequest(input)).nonce, nonce);
  for (const patch of [{ body:'{}' },{ action:'policy' },{ proof:{ ...input.proof,nonce:'f'.repeat(64) } }]) await assert.rejects(authorizeRequest({ ...input,...patch }));
  await assert.rejects(authorizeRequest(input, f.now + 61));
});
