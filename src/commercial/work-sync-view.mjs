import {escapeHTML as esc} from './growth.mjs';
import {FACTORY_CHANNEL} from './work-sync.mjs';

const statusLabels = {
  pending_review:['待验收', 'amber'],
  accepted:['已验收', 'green'],
  changes_requested:['需修改', 'amber']
};

export function workSyncPanel(sync) {
  if (!sync) return '';
  const {snapshot, notice, needsBinding, busy} = sync;
  const rows = (snapshot?.items || []).map(item => {
    const [label, color] = statusLabels[item.status];
    const version = /^[a-f0-9]{64}$/.test(item.version) ? item.version.slice(0, 8) : item.version;
    return `<article class="rv-task-goal">
      <div class="row wrap"><strong>${esc(item.title)}</strong><span class="status ${color}">${label}</span></div>
      <div class="row wrap"><span>版本 ${esc(version)}</span><a class="pill" href="${esc(item.submissionUrl)}">查看交付</a>
      ${item.review ? `<a class="pill" href="${esc(item.review.messageUrl)}">查看验收</a>` : ''}</div>
      ${item.review?.reason ? `<p>${esc(item.review.reason)}</p>` : ''}
    </article>`;
  }).join('');
  return `<section class="rv-task-goal" aria-label="模版工厂交付">
    <div class="row wrap"><h2>模版工厂交付</h2>${snapshot ? `<span class="status">同步版本 ${snapshot.revision}</span>` : ''}</div>
    ${notice ? `<p role="status">${esc(notice)}</p>` : ''}
    ${needsBinding ? `<button type="button" class="pill" data-work-sync-connect ${busy ? 'disabled' : ''}>连接模版工厂</button>` : ''}
    ${rows || (snapshot ? '<p>还没有已同步的交付。</p>' : '')}
    <a class="pill" href="buzz://channel/${FACTORY_CHANNEL}">打开模版工厂频道</a>
  </section>`;
}

export function workSyncBindingForm(channels) {
  if (!channels.length) return '<p>请先创建一个有写入权限的私人 Solo，再连接模版工厂。</p>';
  const options = channels.map(channel => `<option value="${esc(channel.id)}">${esc(channel.name)}</option>`).join('');
  return `<form class="data-form" data-work-sync-bind>
    <label>选择私人 Solo <select name="channel" required><option value="">选择会话</option>${options}</select></label>
    <p>连接会在所选会话保存一条身份绑定记录。</p>
    <button type="submit" class="pill">确认连接</button><p data-work-sync-status role="status"></p>
  </form>`;
}
