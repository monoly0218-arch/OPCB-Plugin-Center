import {escapeHTML as esc} from './growth.mjs';
import {FACTORY_CHANNEL} from './work-sync.mjs';

const statusLabels = {
  pending_review:['待验收', 'amber'],
  accepted:['已验收', 'green'],
  changes_requested:['需修改', 'amber']
};

export function workSyncPanel(sync) {
  if (!sync) return '';
  const {snapshot, notice} = sync;
  const rows = (snapshot?.items || []).map(item => {
    const [label, color] = statusLabels[item.status];
    const version = /^[a-f0-9]{64}$/.test(item.version) ? item.version.slice(0, 8) : item.version;
    const reviewOnSubmission = item.review?.messageUrl === item.submissionUrl;
    return `<article class="rv-task-goal">
      <div class="row wrap"><strong>${esc(item.title)}</strong><span class="status ${color}">${label}</span></div>
      <div class="row wrap"><span>版本 ${esc(version)}</span><a class="pill" href="${esc(item.submissionUrl)}">${reviewOnSubmission ? '查看交付与验收' : '查看交付'}</a>
      ${item.review && !reviewOnSubmission ? `<a class="pill" href="${esc(item.review.messageUrl)}">查看验收</a>` : ''}</div>
      ${item.status === 'pending_review' ? '<p>验收人可在交付消息上点 👍 通过。</p>' : ''}
      ${item.review?.reason ? `<p>${esc(item.review.reason)}</p>` : ''}
    </article>`;
  }).join('');
  return `<section class="rv-task-goal" aria-label="模版工厂交付">
    <h2>模版工厂交付</h2>
    ${notice ? `<p role="status">${esc(notice)}</p>` : ''}
    ${rows || (snapshot ? '<p>还没有交付。</p>' : '')}
    <a class="pill" href="buzz://channel/${FACTORY_CHANNEL}">打开模版工厂频道</a>
  </section>`;
}
