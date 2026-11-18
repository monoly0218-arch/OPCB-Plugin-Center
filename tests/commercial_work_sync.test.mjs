import assert from 'node:assert/strict';
import test from 'node:test';
import {createWorkSyncFeed, FACTORY_CHANNEL, readFactoryDeliveries} from '../src/commercial/work-sync.mjs';
import {workSyncPanel} from '../src/commercial/work-sync-view.mjs';

const owner = '96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d';
const agent = '9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608';
const reviewer = '5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48';
const oldRequest = '4898b8ac783673018d4ded05760fbf756bfea7c68eeaa78e2244498639ac527b';
const oldDelivery = '6878348f8b4a7c778660fb413e482d59b175056d106b95c5ed375e5ea7eb93ab';
const newDelivery = 'b3b26e93e8f75557662257b8bd14940a9fbbfedef7f2dd56196877211c5dab8e';
const key = number => number.toString(16).padStart(64, '0');
const relayAuthor = key(1);
const start = 1795005943;
const source = id => `buzz://message?channel=${FACTORY_CHANNEL}&id=${id}`;
const room = ['h', FACTORY_CHANNEL];
const reply = id => ['e', id, '', 'reply'];
const request = id => ['buzz:request', id];
const attachment = (digest, origin = 'https://paogroup.communities.buzz.xyz') => [
  'imeta', 'url ' + origin + '/media/' + digest + '.mp4', 'x ' + digest
];
const message = (id, pubkey, created_at, content, tags = []) => ({
  id, kind: 9, pubkey, created_at, content, tags: [room, ...tags]
});
const fields = (task, title) => `work-sync-task: ${task}\nwork-sync-title: ${title}`;
const pilot = message(oldDelivery, agent, start - 500, '原始交付', [
  reply(oldRequest), request(oldRequest), attachment(key(100)), ['auth', 'owner-attestation']
]);
const v10 = message(newDelivery, agent, start + 5, fields('template-wipe-zoom', '擦拭与文字放大 V10'), [
  reply(oldRequest), request(oldRequest), attachment(key(101)), ['auth', 'owner-attestation']
]);
const ownerInstruction = message(oldRequest, owner, start - 700, '请回传两件原片');
const reaction = (id, pubkey, target, offset = 30, content = '👍🏾') => ({
  id, pubkey, created_at: start + offset, kind: 7, content, tags: [room, ['e', target]]
});
const v10ThumbsUp = reaction(key(41), reviewer, newDelivery);
const pilotThumbsUp = reaction(key(40), reviewer, oldDelivery);
const folded = event => ({
  id: event.id, authorId: event.pubkey, channelId: FACTORY_CHANNEL, createdAt: event.created_at, content: event.content
});

function host(records = [], options = {}) {
  const all = [ownerInstruction, pilot, v10, ...records];
  const roster = {
    id: key(2), kind: 39002, pubkey: relayAuthor, created_at: start, content: '',
    tags: [['d', FACTORY_CHANNEL], ['p', owner, '', 'owner'], ['p', agent, '', 'bot'],
      ['p', reviewer, '', options.reviewerRole ?? 'member']]
  };
  const open = new Set();
  let maxOpen = 0;
  const calls = [];
  const readRemote = async ([filter], {signal}) => {
    signal.throwIfAborted();
    calls.push(filter);
    if (options.fail?.(filter)) throw Error('Buzz 离线');
    return [roster, ...all].filter(event =>
      (!filter.kinds || filter.kinds.includes(event.kind)) &&
      (!filter.ids || filter.ids.includes(event.id)) &&
      (!filter.authors || filter.authors.includes(event.pubkey)) &&
      (filter.since === undefined || event.created_at >= filter.since) &&
      (filter.until === undefined || event.created_at < filter.until ||
        (event.created_at === filter.until && event.id > filter.before_id)) &&
      (!filter['#h'] || event.tags.some(([tag, val]) => tag === 'h' && filter['#h'].includes(val))) &&
      (!filter['#d'] || event.tags.some(([tag, val]) => tag === 'd' && filter['#d'].includes(val))))
      .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, filter.limit);
  };
  return {
    viewer: owner, relayAuthor, open, calls, maxOpen: () => maxOpen,
    readRemote,
    thread(channel, id, {exact}) {
      assert.equal(channel, FACTORY_CHANNEL);
      assert.equal(exact, true);
      open.add(id);
      maxOpen = Math.max(maxOpen, open.size);
      const event = all.find(event => event.id === id);
      return {
        async refresh() { await options.pause?.(id); },
        snapshot() {
          if (!event || options.deleted?.has(id)) return {status: 'ready', targetStatus: 'unavailable'};
          const reactions = (options.reactionIds?.get(id) ??
            all.filter(e => e.kind === 7 && e.tags.at(-1)[1] === id).map(e => e.id))
            .filter(id => !options.withdrawn?.has(id))
            .map(id => {
              const event = all.find(event => event.id === id);
              return {content: event.content, events: [{id, authorId: event.pubkey}]};
            });
          return {
            status: 'ready', targetStatus: 'ready',
            target: {...folded(event), reactions},
            replies: all.filter(event => event.kind === 9 && event.id !== id && !options.deleted?.has(event.id)).map(folded)
          };
        },
        dispose() { open.delete(id); }
      };
    }
  };
}

const read = session => readFactoryDeliveries(session, new AbortController().signal);

test('discovers both pilot deliveries and resolves each active thumbs-up without an HTTPS service', async () => {
  const session = host([pilotThumbsUp, v10ThumbsUp]);
  const first = await read(session);
  assert.deepEqual(first.items.map(item => [item.taskId, item.status, item.review.messageUrl]), [
    ['template-v8-23', 'accepted', source(oldDelivery)],
    ['template-wipe-zoom', 'accepted', source(newDelivery)]
  ]);
  assert.deepEqual(await read(host([v10ThumbsUp, pilotThumbsUp])), first);
  assert.equal(session.open.size, 0);
  assert.ok(session.maxOpen() <= 4);
  assert.match(workSyncPanel({snapshot:first}), /查看交付与验收/);
  assert.doesNotMatch(workSyncPanel({snapshot:first}), /连接模版工厂|同步版本/);
});

test('requires an exact owner instruction, preserves the first report of the same bytes and allows a new version', async () => {
  const task = 'new-work';
  const instruction = message(key(10), owner, start + 1, `请回传\nwork-sync-task: ${task}`);
  const impostor = message(key(11), reviewer, start + 1, instruction.content);
  const deliver = (id, offset, options = {}) => message(key(id), options.author ?? agent, start + offset,
    fields(options.task ?? task, '新交付'), [
      reply(options.reply ?? instruction.id), request(options.request ?? instruction.id),
      attachment(key(options.digest ?? 50), options.origin)
    ]);
  const session = host([
    instruction, impostor,
    deliver(20, 2), deliver(21, 3), deliver(22, 4, {digest:51}),
    deliver(23, 4, {request:impostor.id, reply:impostor.id, digest:52}),
    deliver(24, 4, {reply:oldRequest, digest:53}),
    deliver(25, 4, {task:'other', digest:54}),
    deliver(26, 4, {author:reviewer, digest:55}),
    deliver(27, 4, {origin:'https://elsewhere.example', digest:56}),
    deliver(28, 4, {request:oldRequest, reply:oldRequest, digest:57}),
    reaction(key(43), reviewer, key(21))
  ]);
  const result = await read(session);
  assert.deepEqual(result.items.filter(item => item.taskId === task).map(item => [item.version, item.status]), [
    [key(20), 'pending_review'], [key(22), 'pending_review']
  ]);
});

test('a withdrawn, wrong-target or wrong-author reaction never approves a delivery', async () => {
  const withdrawn = new Set();
  const spoofed = reaction(key(42), owner, newDelivery);
  const wrongTarget = reaction(key(43), reviewer, oldDelivery);
  const reactionIds = new Map([[newDelivery, [spoofed.id, wrongTarget.id, v10ThumbsUp.id]]]);
  const session = host([v10ThumbsUp, spoofed, wrongTarget], {withdrawn, reactionIds});
  assert.equal((await read(session)).items[1].status, 'accepted');
  withdrawn.add(v10ThumbsUp.id);
  const snapshot = await read(session);
  assert.equal(snapshot.items[1].status, 'pending_review');
  assert.match(workSyncPanel({snapshot}), /验收人可在交付消息上点 👍 通过/);
  assert.equal((await read(host([v10ThumbsUp], {reviewerRole:'guest'}))).items[1].status, 'pending_review');
});

test('a later signed review is scoped to the exact delivery and shows its reason', async () => {
  const general = message(key(50), reviewer, start + 39, '通过', [reply(oldRequest)]);
  const correction = message(key(51), reviewer, start + 45, '需修改：修正字幕。', [reply(newDelivery)]);
  const result = await read(host([v10ThumbsUp, general, correction]));
  assert.equal(result.items[0].status, 'pending_review');
  assert.equal(result.items[1].status, 'changes_requested');
  assert.equal(result.items[1].review.messageUrl, source(correction.id));
  assert.match(workSyncPanel({snapshot:result}), /修正字幕/);
  const exactLink = message(key(52), reviewer, start + 46, '通过 ' + source(newDelivery), [reply(oldRequest)]);
  const accepted = await read(host([general, correction, exactLink]));
  assert.equal(accepted.items[1].status, 'accepted');
});

test('discovery traverses a full page with identical timestamps and drops a deleted delivery', async () => {
  const records = Array.from({length:100}, (_, i) => message(key(1000 + i), owner, start + 6, '普通消息'));
  records.push(message(key(1200), owner, start + 6, fields('last-page', '新增交付'), [attachment(key(1200))]));
  const session = host(records, {deleted:new Set([newDelivery])});
  assert.deepEqual((await read(session)).items.map(item => item.taskId), ['template-v8-23', 'last-page']);
  assert.ok(session.calls.some(call => call.before_id === key(1099)));
});

test('feed clears stale results on loss of access and discards an in-flight read', async () => {
  let access = {members: [owner, agent, reviewer]};
  let finish, started;
  const paused = new Promise(resolve => { finish = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let hold = false;
  const session = host([v10ThumbsUp], {pause: id => {
    if (hold && id === newDelivery) { started(); return paused; }
  }});
  const feed = createWorkSyncFeed({session, access:() => access, onState: () => {}});
  await feed.refresh();
  assert.equal(feed.status().snapshot.items[1].status, 'accepted');
  hold = true;
  const inflight = feed.refresh();
  await entered;
  access = null;
  feed.roster();
  assert.match(feed.status().notice, /无权读取/);
  assert.equal(session.open.size, 0);
  finish();
  await inflight;
  assert.equal(feed.status().snapshot, undefined);
  feed.dispose();
});

test('feed surfaces a Buzz read failure without displaying an old acceptance', async () => {
  let offline = false;
  const session = host([v10ThumbsUp], {fail:() => offline});
  const feed = createWorkSyncFeed({session, access:() => ({members:[owner]}), onState: () => {}});
  await feed.refresh();
  assert.ok(feed.status().snapshot);
  offline = true;
  await feed.refresh();
  assert.match(feed.status().notice, /离线/);
  assert.equal(feed.status().snapshot, undefined);
});
