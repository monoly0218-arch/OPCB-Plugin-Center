// Mirrors the deployed /ins/app.js observed on 2026-11-15 UTC.
export const FACTORY_STAGES = [
  ['inbox', '灵感收集'], ['rank', '高赞排行'], ['confirm', '素材确认'],
  ['progress', '制作中'], ['review', '待审核'], ['ready', '待发布'],
  ['downloads', '下载状态'], ['discarded', '已收起'],
];
export const cardStage = card => card.status === 'done' ? 'review' : card.status;
export const likes = (data, id) => data.reviews.filter(r => r.card_id === id && r.verdict === 'yes').length;
export function inStage(data, card, stage) {
  const value = cardStage(card);
  if (stage === 'inbox') return value === 'pending' && card.media_status === 'ready';
  if (stage === 'rank') return ['pending', 'approved'].includes(value) && card.media_status === 'ready' && likes(data, card.id) > 0;
  if (stage === 'downloads') return value === 'pending' && card.media_status !== 'ready';
  return value === stage;
}
export function materialRows(data, {stage = 'inbox', query = '', filter = 'all', collector = ''} = {}) {
  const q = query.trim().toLocaleLowerCase();
  const rows = data.cards.filter(card => {
    if (!inStage(data, card, stage) || collector && card.created_by !== collector) return false;
    if (stage === 'inbox' && filter === 'unseen' && data.reviews.some(r => r.card_id === card.id && r.member_id === data.current_member.id)) return false;
    const creator = data.members.find(m => m.id === card.created_by)?.name || '';
    return !q || [card.title, card.note || '', card.platform || '', creator].join(' ').toLocaleLowerCase().includes(q);
  });
  if (stage === 'rank') rows.sort((a, b) => likes(data, b.id) - likes(data, a.id) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  return rows;
}
export function resultVersions(data, card) {
  return (Array.isArray(data.result_versions) ? data.result_versions : [])
    .filter(v => v && v.card_id === card.id && Number.isSafeInteger(v.revision) && v.revision > 0 && v.revision <= card.result_revision)
    .slice().sort((a, b) => b.revision - a.revision);
}
