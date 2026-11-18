export const FACTORY_CHANNEL = '778996be-f459-4188-bac9-6303a1355dda';
const OWNER = '96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d';
const AGENT = '9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608';
const REVIEWER = '5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48';
const PILOT_REQUEST = '4898b8ac783673018d4ded05760fbf756bfea7c68eeaa78e2244498639ac527b';
const PILOT_DELIVERY = '6878348f8b4a7c778660fb413e482d59b175056d106b95c5ed375e5ea7eb93ab';
// These two existing receipts predate task IDs on the owner's instructions.
const LEGACY_RECEIPTS = new Set([
  PILOT_DELIVERY,
  'b3b26e93e8f75557662257b8bd14940a9fbbfedef7f2dd56196877211c5dab8e'
]);
const DISCOVERY_START = 1795005943;
const MEDIA_ORIGIN = 'https://paogroup.communities.buzz.xyz';
const HEX = /^[0-9a-f]{64}$/;
const TASK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const THUMBS_UP = /^👍\uFE0F?[🏻-🏿]?$/u;
const EDITOR_ROLES = new Set(['owner', 'admin', 'member']);
const READ_ROLES = new Set([...EDITOR_ROLES, 'guest', 'bot']);
const PAGE_SIZE = 100;
const ITEM_LIMIT = 100;

const link = id => `buzz://message?channel=${FACTORY_CHANNEL}&id=${id}`;
const values = (event, name) => event.tags.filter(tag => tag[0] === name && tag.length >= 2).map(tag => tag[1]);
const compare = (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id);

const belongs = event => event.kind === 9 && HEX.test(event.id) &&
  values(event, 'h').join(',') === FACTORY_CHANNEL;
const repliesTo = (event, id) => event.tags
  .filter(([name, target, , marker]) => name === 'e' && marker === 'reply' && HEX.test(target?.toLowerCase()))
  .at(-1)?.[1].toLowerCase() === id;
const taskId = event => field(event.content, 'work-sync-task');

function field(content, name) {
  const prefix = name + ':';
  const lines = content.split(/\r?\n/).filter(line => line.startsWith(prefix));
  return lines.length === 1 ? lines[0].slice(prefix.length).trim() : '';
}

function attachment(event) {
  const descriptors = event.tags.filter(([name]) => name === 'imeta');
  if (descriptors.length !== 1) return;
  const parts = descriptors[0].slice(1);
  const urls = parts.filter(part => part.startsWith('url '));
  const hashes = parts.filter(part => part.startsWith('x '));
  if (urls.length !== 1 || hashes.length !== 1) return;
  const digest = hashes[0].slice(2);
  const url = urls[0].slice(4);
  if (!HEX.test(digest) || !url.startsWith(MEDIA_ORIGIN + '/media/')) return;
  const file = url.slice((MEDIA_ORIGIN + '/media/').length);
  if (file === digest || (file.startsWith(digest + '.') && /^[a-z0-9]+$/i.test(file.slice(digest.length + 1)))) {
    return {digest, url};
  }
}

const channelFilter = {'#h': [FACTORY_CHANNEL]};
const isOriginal = (row, event) => row?.id === event.id && row.channelId === FACTORY_CHANNEL &&
  row.authorId === event.pubkey && (!row.signerId || row.signerId === event.pubkey) &&
  (!row.delivery || row.delivery === 'seen');

async function exactThread(session, id, signal, read) {
  signal.throwIfAborted();
  const view = session.thread(FACTORY_CHANNEL, id, {exact: true});
  const dispose = () => view.dispose();
  signal.addEventListener('abort', dispose, {once: true});
  try {
    await view.refresh();
    signal.throwIfAborted();
    const thread = view.snapshot();
    if (thread.targetStatus === 'unavailable') return;
    if (thread.status !== 'ready' || thread.targetStatus !== 'ready' || thread.target?.id !== id) {
      throw Error('Buzz 暂时无法确认单件消息');
    }
    return await read(thread, view.snapshot);
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}

async function memberRoles(session, signal) {
  const rows = await session.readRemote([{
    kinds: [39002], authors: [session.relayAuthor], '#d': [FACTORY_CHANNEL], limit: 1,
    consistency: 'strong'
  }], {signal});
  const roster = rows.find(event => event.kind === 39002 &&
    event.pubkey === session.relayAuthor && values(event, 'd').join(',') === FACTORY_CHANNEL);
  if (!roster) throw Error('Buzz 暂时无法确认模版工厂成员');
  const roles = new Map();
  for (const [name, key, , role] of roster.tags) {
    if (name !== 'p') continue;
    if (!HEX.test(key) || roles.has(key)) throw Error('Buzz 模版工厂成员信息不完整');
    roles.set(key, role);
  }
  if (!READ_ROLES.has(roles.get(session.viewer))) throw Error('当前身份无权读取模版工厂');
  return roles;
}

async function discover(session, signal) {
  const found = new Map();
  const filter = {
    ...channelFilter, kinds: [9], authors: [OWNER, AGENT], since: DISCOVERY_START,
    limit: PAGE_SIZE
  };
  for (let page = 0; page < 20; page++) {
    // Remote-only reads keep the paging cursor independent of local writes and live merges.
    const events = await session.readRemote([{...filter}], {signal});
    const eligible = events.filter(event => event.kind === 9 && HEX.test(event.id) &&
      [OWNER, AGENT].includes(event.pubkey) && event.created_at >= DISCOVERY_START &&
      (filter.until === undefined || event.created_at < filter.until ||
        (event.created_at === filter.until && event.id > filter.before_id)));
    for (const event of eligible) {
      if (belongs(event) && taskId(event)) found.set(event.id, event);
    }
    if (events.length < PAGE_SIZE) return [...found.values()];
    const last = eligible.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).at(-1);
    if (!last) break;
    filter.until = last.created_at;
    filter.before_id = last.id;
  }
  throw Error('模版工厂交付记录超出本次读取范围');
}

function reviewFrom(event, reaction, submission) {
  if (event.pubkey !== REVIEWER || event.created_at < submission.created_at || values(event, 'auth').length) return;
  if (reaction) {
    const channels = values(event, 'h');
    const target = values(event, 'e').map(id => id.toLowerCase()).filter(id => HEX.test(id)).at(-1);
    if (event.kind === 7 && event.content === reaction && target === submission.id &&
        (!channels.length || channels.join(',') === FACTORY_CHANNEL)) {
      return {event, status: 'accepted', messageUrl: link(submission.id), reason: ''};
    }
    return;
  }
  if (!belongs(event)) return;
  const suffix = ' ' + link(submission.id);
  let command = event.content.trim();
  if (command.endsWith(suffix)) command = command.slice(0, -suffix.length).trim();
  else if (!repliesTo(event, submission.id)) return;
  const match = /^(通过这一版|验收通过|通过|退回|需修改)(?:[：:]\s*(.+))?$/s.exec(command.replace(/。$/, ''));
  if (!match) return;
  const status = ['退回', '需修改'].includes(match[1]) ? 'changes_requested' : 'accepted';
  const reason = (match[2] || '').trim().slice(0, 1000);
  if (status === 'changes_requested' && !reason) return;
  return {event, status, messageUrl: link(event.id), reason};
}

async function activeReview(session, submission, thread, snapshot, signal) {
  const reactions = new Map();
  for (const group of thread.target.reactions ?? []) {
    if (!THUMBS_UP.test(group.content)) continue;
    for (const event of group.events) {
      if (event.authorId === REVIEWER && HEX.test(event.id)) reactions.set(event.id, group.content);
    }
  }
  const replies = new Map(thread.replies
    .filter(row => row.authorId === REVIEWER && row.createdAt >= submission.created_at && !row.edited &&
      /^(通过|验收通过|退回|需修改)/.test((row.sourceContent ?? row.content).trim()))
    .map(row => [row.id, row]));
  const ids = [...new Set([...reactions.keys(), ...replies.keys()])];
  const reviews = [];
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    const batch = ids.slice(start, start + PAGE_SIZE);
    const evidence = await session.readRemote([{ids: batch, authors: [REVIEWER], limit: batch.length}], {signal});
    for (const event of evidence) {
      const reaction = reactions.get(event.id);
      if (!batch.includes(event.id) || (!reaction && !isOriginal(replies.get(event.id), event))) continue;
      const review = reviewFrom(event, reaction, submission);
      if (review) reviews.push(review);
    }
  }
  const current = snapshot();
  const active = new Set(current.target?.reactions.flatMap(group => group.events.map(event => event.id)));
  const text = new Set(current.replies.filter(row => !row.edited).map(row => row.id));
  reviews.sort((a, b) => compare(a.event, b.event));
  const reactionReview = reviews.find(({event}) => event.kind === 7 && active.has(event.id));
  const textReview = reviews.findLast(({event}) => event.kind === 9 && text.has(event.id));
  return textReview && (!reactionReview || textReview.event.created_at >= reactionReview.event.created_at)
    ? textReview : reactionReview;
}

export async function readFactoryDeliveries(session, signal) {
  if (typeof session.readRemote !== 'function' || typeof session.thread !== 'function') {
    throw Error('当前 Buzz 版本暂不支持读取模版工厂交付');
  }
  const roles = await memberRoles(session, signal);
  const [seed, events] = await Promise.all([
    session.readRemote([{...channelFilter, kinds: [9], ids: [PILOT_DELIVERY], limit: 1}], {signal}),
    discover(session, signal)
  ]);
  const ordered = [...seed.filter(event => event.id === PILOT_DELIVERY),
    ...events.filter(event => event.id !== PILOT_DELIVERY).sort(compare)];
  const requests = new Map();
  function ownerRequest(id) {
    if (!requests.has(id)) {
      requests.set(id, (async () => {
        const rows = await session.readRemote([{...channelFilter, kinds: [9], ids: [id], limit: 1}], {signal});
        const event = rows.find(row => row.id === id && row.pubkey === OWNER && belongs(row) && !values(row, 'auth').length);
        if (!event || !EDITOR_ROLES.has(roles.get(OWNER))) return;
        return exactThread(session, id, signal, thread => isOriginal(thread.target, event) ? event : undefined);
      })());
    }
    return requests.get(id);
  }

  async function candidate(event) {
    if (!belongs(event)) return;
    const pinned = event.id === PILOT_DELIVERY;
    const task = pinned ? 'template-v8-23' : taskId(event);
    const title = pinned ? '草原／火车 V8-23' : field(event.content, 'work-sync-title');
    const file = attachment(event);
    if (!TASK_ID.test(task) || !title || [...title].length > 120 || !file) return;
    const role = roles.get(event.pubkey);
    if (event.pubkey === AGENT && (EDITOR_ROLES.has(role) || role === 'bot')) {
      const refs = values(event, 'buzz:request');
      if (refs.length !== 1 || !HEX.test(refs[0]) || !repliesTo(event, refs[0])) return;
      const request = await ownerRequest(refs[0]);
      if (!request || request.created_at > event.created_at) return;
      const legacy = request.id === PILOT_REQUEST && LEGACY_RECEIPTS.has(event.id);
      if (!legacy && taskId(request) !== task) return;
    } else if (event.pubkey !== OWNER || !EDITOR_ROLES.has(role) || values(event, 'auth').length) return;
    return {event, task, title, file};
  }

  const seen = new Set();
  const items = [];
  for (let start = 0; start < ordered.length; start += 4) {
    signal.throwIfAborted();
    const candidates = await Promise.all(ordered.slice(start, start + 4).map(candidate));
    for (const entry of candidates) {
      if (!entry) continue;
      const {event, file, task, title} = entry;
      const key = task + ':' + file.digest;
      if (seen.has(key)) continue;
      const item = await exactThread(session, event.id, signal, async (thread, snapshot) => {
        if (!isOriginal(thread.target, event)) return;
        const decision = EDITOR_ROLES.has(roles.get(REVIEWER))
          ? await activeReview(session, event, thread, snapshot, signal) : null;
        if (!isOriginal(snapshot().target, event)) return;
        return {
          taskId: task, version: event.id, title, submissionUrl: link(event.id), attachmentUrls: [file.url],
          status: decision?.status ?? 'pending_review',
          review: decision ? {reviewerId: REVIEWER, reason: decision.reason, messageUrl: decision.messageUrl} : null
        };
      });
      if (item) {
        seen.add(key);
        items.push(item);
      }
    }
  }
  return {items: items[0]?.version === PILOT_DELIVERY && items.length > ITEM_LIMIT
    ? [items[0], ...items.slice(-(ITEM_LIMIT - 1))] : items.slice(-ITEM_LIMIT)};
}

export function createWorkSyncFeed({session, access, onState}) {
  let state = {notice: '正在确认 Buzz 频道权限…'};
  let controller, membership, disposed = false;
  const publish = next => {
    if (disposed) return;
    state = next;
    onState(state);
  };
  function revoke() {
    controller?.abort();
    controller = undefined;
    membership = undefined;
    if (state.notice !== '当前身份无权读取模版工厂') publish({notice: '当前身份无权读取模版工厂'});
  }
  async function refresh() {
    if (disposed) return;
    const channel = access();
    if (!channel) return revoke();
    controller?.abort();
    const read = new AbortController();
    controller = read;
    membership = [...channel.members].sort().join(',');
    publish({notice: '正在从 Buzz 读取交付与验收…'});
    try {
      const snapshot = await readFactoryDeliveries(session, read.signal);
      if (controller === read && !read.signal.aborted) {
        if (access()) publish({snapshot});
        else revoke();
      }
    } catch (error) {
      if (controller === read && !read.signal.aborted) {
        if (access()) publish({notice: error instanceof Error ? error.message : '暂时无法读取模版工厂'});
        else revoke();
      }
    } finally {
      if (controller === read) controller = undefined;
    }
  }
  return {
    status: () => state,
    refresh,
    roster() {
      const channel = access();
      if (!channel) revoke();
      else if ([...channel.members].sort().join(',') !== membership) void refresh();
    },
    dispose() {
      disposed = true;
      controller?.abort();
      controller = undefined;
    }
  };
}
