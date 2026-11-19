import test from "node:test";
import assert from "node:assert/strict";
import { apply, newPool, claim, overview, parseCanvas, report } from "../src/higgsfield-pool/plugin.js";

const a = { member: "a".repeat(64), agent: "b".repeat(64) };
const b = { member: "c".repeat(64), agent: "d".repeat(64) };
const now = "2026-11-19T00:00:00.000Z";
const sample = (id, state = "available") => ({
  id: `HF-${id}`,
  email: `test-${id}@example.org`,
  password: "synthetic-test-password",
  auxiliary_email: `aux-${id}@example.org`,
  inbox_url: "https://example.org/",
  state,
});

test("holders receive only allocated credentials and released requests do not allocate again", () => {
  const source = newPool({ accounts: [sample("001"), sample("002", "review"), sample("003")] });
  const args = { request_id: "request-1", template: "新品视频" };
  const first = claim(source, args, a, now);
  assert.equal(first.result.accounts[0].password, "synthetic-test-password");
  assert.equal(first.result.accounts[0].account_id, "HF-001");
  assert.equal(overview(first.next).accounts[0].password, undefined);
  assert.equal(claim(first.next, args, a, now).next, first.next);
  assert.throws(() => report(first.next, {
    request_id: args.request_id, account_id: "HF-001", result: "used",
  }, b, now), /不属于/);
  const released = report(first.next, {
    request_id: args.request_id, account_id: "HF-001", result: "release", no_inflight: true,
  }, a, now);
  assert.equal(overview(released.next).accounts[0].member, null);
  assert.equal(claim(released.next, args, a, now).next, released.next);
  assert.equal(claim(released.next, args, a, now).result.accounts[0].password, undefined);
});

test("the pool records member, template and free-credit outcomes", () => {
  const source = newPool({ accounts: [sample("001"), sample("002")] });
  const claimed = claim(source, { request_id: "batch", count: 2 }, a, now).next;
  const used = { account_id: "HF-001", request_id: "batch", result: "used", template: "广告模板" };
  const first = report(claimed, used, a, now);
  assert.deepEqual([first.result.status, first.result.template, first.result.member], ["已使用", "广告模板", a.member]);
  assert.equal(report(first.next, used, a, now).next, first.next);
  const second = report(first.next, {
    account_id: "HF-002", request_id: "batch", result: "no_free",
  }, a, now);
  assert.equal(overview(second.next).counts.no_free, 1);
  assert.throws(() => report(second.next, { ...used, result: "release", no_inflight: true }, a, now), /占用已变化/);
});

test("the team roster and native Canvas revision gate claims and inventory additions", async () => {
  let head = { id: "initial", content: JSON.stringify(newPool({ accounts: [sample("001"), sample("002")] })) };
  const makeClient = actor => {
    const channel = {
      id: "team-channel", name: "Higgsfield 号池", private: true, channelType: "stream",
      members: [a.member, b.member], creator: a.member,
    };
    const session = {
      viewer: actor.member,
      channels: { list: () => ({ status: "ready", channels: [channel] }) },
      canvas: {
        available: true,
        read: async () => head,
        save: async (_channel, content, expected) => {
          if (expected !== head.id) {
            const error = new Error("conflict");
            error.name = "CanvasConflictError";
            throw error;
          }
          return (head = { id: `${expected}-saved`, content });
        },
      },
    };
    const relay = { snapshot: () => ({ status: "ready", session, scope: "team", generation: 1 }) };
    const tools = new Map();
    apply({
      react: {}, relay,
      pages: { register() {} },
      agents: {
        relay: () => relay,
        addTool: tool => tools.set(tool.name, tool),
        addInstructions() {},
      },
    });
    const client = { key: "local", owner: actor.member, pubkey: actor.agent };
    return {
      claim: id => tools.get("higgsfield_pool_claim").call(client, {}, { request_id: id }).then(JSON.parse),
      append: accounts => tools.get("higgsfield_pool_append").call(client, {}, { accounts }).then(JSON.parse),
      report: args => tools.get("higgsfield_pool_report").call(client, {}, args).then(JSON.parse),
      makePublic: () => { channel.private = false; },
    };
  };
  const first = makeClient(a);
  const second = makeClient(b);
  const [one, two] = await Promise.allSettled([first.claim("one"), second.claim("two")]);
  assert.equal(one.status, "fulfilled");
  assert.equal(two.status, "rejected");
  assert.match(two.reason.message, /原参数重试/);
  assert.equal(one.value.accounts[0].account_id, "HF-001");
  assert.equal((await second.claim("two")).accounts[0].account_id, "HF-002");
  assert.equal(overview(parseCanvas(head)).counts.occupied, 2);

  const incoming = [sample("003", "review"), { ...sample("090"), email: sample("001").email.toUpperCase() }];
  await assert.rejects(second.append(incoming), /管理员/);
  await assert.rejects(first.append([{ ...sample("001"), email: "other@example.org" }]), /已用于其他账号/);
  const reportArgs = { request_id: "two", account_id: "HF-002", result: "no_free" };
  const [append, concurrentReport] = await Promise.allSettled([first.append(incoming), second.report(reportArgs)]);
  assert.equal(append.status, "fulfilled");
  assert.deepEqual(append.value, {
    added: ["HF-003"], existing: ["HF-001"], counts: { available: 0, occupied: 2, used: 0, no_free: 0, review: 1 },
  });
  assert.equal(concurrentReport.status, "rejected");
  assert.match(concurrentReport.reason.message, /原参数重试/);
  assert.equal((await second.report(reportArgs)).state, "no_free");
  const beforeRetry = head;
  const retry = await first.append(incoming);
  assert.deepEqual(retry.added, []);
  assert.deepEqual(retry.existing, ["HF-003", "HF-001"]);
  assert.equal(head, beforeRetry);
  assert.equal(parseCanvas(head).requests.length, 2);
  assert.deepEqual(retry.counts, { available: 0, occupied: 1, used: 0, no_free: 1, review: 1 });

  first.makePublic();
  await assert.rejects(first.claim("new"), /私有频道/);
  await assert.rejects(first.append([sample("004")]), /私有频道/);
});

test("seed validation rejects untrusted storage and malformed eligible records", () => {
  assert.throws(() => parseCanvas({ content: "other project" }), /专用号池频道/);
  assert.throws(() => newPool({ accounts: [sample("001"), sample("001")] }), /重复/);
  assert.throws(() => newPool({ accounts: [{ ...sample("001"), inbox_url: "javascript:alert(1)" }] }), /HTTPS/);
  assert.throws(() => newPool({ accounts: [{ ...sample("001"), auxiliary_email: "" }] }), /字段缺失/);
});
