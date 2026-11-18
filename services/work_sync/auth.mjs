import { webcrypto } from "node:crypto";
import { verifyEvent } from "nostr-tools/pure";
import { fingerprint, publicKey, sha } from "../knowledge/identity_auth.mjs";

const hex = /^[a-f0-9]{64}$/;
const prefix = "/opcb-plugins/work-sync/api/v1";
const refuse = () => { throw new Error("Invalid work-sync proof"); };

export function verifyBinding(event, community, audience, now) {
  if (!event || event.kind !== 45010 || !hex.test(event.pubkey)
      || !Number.isSafeInteger(event.created_at) || Math.abs(event.created_at - now) > 90
      || !Array.isArray(event.tags) || event.tags.length > 32
      || event.tags.some(tag => tag[0] === "auth")
      || event.tags.filter(tag => tag[0] === "h" && tag[1]).length !== 1
      || typeof event.content !== "string" || Buffer.byteLength(event.content) > 4096
      || !verifyEvent(event)) refuse();
  const { version, purpose, audience: intended, community: target, deviceKey, nonce, role, ...extra } = JSON.parse(event.content);
  if (version !== 1 || purpose !== "opcb.work-sync.device-binding" || intended !== audience
      || !hex.test(community) || community !== target || !hex.test(nonce) || role !== "read"
      || Object.keys(extra).length) refuse();
  return { owner: event.pubkey, actor: event.pubkey, role, proof_id: event.id,
    delegated: false, nonce, deviceKey: publicKey(deviceKey), device: fingerprint(deviceKey) };
}

export async function verifyRequest(input, audience, now) {
  const { proof, publicKey: key, body, action } = input;
  if (action !== "snapshot" || typeof body !== "string" || Buffer.byteLength(body) > 1024
      || !proof || Object.keys(proof).sort().join(",") !== "device,nonce,signature,timestamp"
      || proof.device !== fingerprint(key) || !hex.test(proof.nonce)
      || !Number.isSafeInteger(proof.timestamp) || Math.abs(proof.timestamp - now) > 60
      || !/^[a-zA-Z0-9_-]{86}$/.test(proof.signature)) refuse();
  const message = JSON.stringify(["opcb.work-sync.request.v1", audience + "/snapshot", body, proof.nonce, proof.timestamp]);
  const imported = await webcrypto.subtle.importKey("jwk", publicKey(key), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  if (!await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, imported, Buffer.from(proof.signature, "base64url"), Buffer.from(message))) refuse();
  return { nonce: proof.nonce, request_id: sha(message) };
}

async function main() {
  const parts = [];
  let size = 0;
  for await (const part of process.stdin) {
    size += part.length;
    if (size > 1024 * 1024) refuse();
    parts.push(part);
  }
  const input = JSON.parse(Buffer.concat(parts).toString("utf8"));
  if (input.operation === "verify_events" && Array.isArray(input.events) && input.events.length <= 100) {
    return input.events.filter(event => event && verifyEvent(event)).map(event => event.id);
  }
  const audience = process.env.OPCB_WORK_SYNC_AUDIENCE;
  if (!audience || !audience.startsWith("https://") || new URL(audience).origin + prefix !== audience) refuse();
  const now = Math.floor(Date.now() / 1000);
  if (input.operation === "bind") return verifyBinding(input.event, input.community, audience, now);
  if (input.operation === "request") return verifyRequest(input, audience, now);
  return refuse();
}

if (process.argv[1]?.endsWith("/auth.mjs")) {
  try { process.stdout.write(JSON.stringify(await main())); }
  catch { process.exitCode = 1; }
}
