export const FACTORY_STAGES = [
  ['inbox', '灵感收集'], ['confirm', '素材确认'], ['progress', '制作中'],
  ['review', '待审核'], ['ready', '待发布'],
];
export const cardStage = card => card.status === 'done' ? 'review' : card.status;
export const likes = (data, id) => data.reviews.filter(r => r.card_id === id && r.verdict === 'yes').length;
export function inStage(data, card, stage) {
  const value = cardStage(card);
  if (stage === 'inbox') return ['pending', 'approved'].includes(value) && card.media_status === 'ready';
  if (stage === 'ready' && data.production_versions?.some(version => version.card_id === card.id && version.review_status === 'approved')) return true;
  if (stage === 'review' && data.production_versions?.some(version => version.card_id === card.id && version.review_status === 'pending')) return true;
  if (stage === 'progress' && Array.isArray(data.production_claims) && ['review', 'ready'].includes(value)) {
    return productionParticipants(data, card).some(person => {
      const latest = person.versions.reduce((current, version) =>
        !current || version.version_number > current.version_number ? version : current, null);
      return !latest?.result_revision || latest.review_status === 'revise';
    });
  }
  if (stage === 'downloads') return ['pending', 'approved'].includes(value) && card.media_status !== 'ready';
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
  return rows;
}
export function resultVersions(data, card) {
  return (Array.isArray(data.result_versions) ? data.result_versions : [])
    .filter(v => v && v.card_id === card.id && Number.isSafeInteger(v.revision) && v.revision > 0 && v.revision <= card.result_revision)
    .slice().sort((a, b) => b.revision - a.revision);
}


export function productionParticipants(data, card) {
  const claims = Array.isArray(data.production_claims)
    ? data.production_claims.filter(claim => claim.card_id === card.id)
    : ['progress', 'review', 'ready'].includes(cardStage(card)) && card.owner_id
      ? [{member_id: card.owner_id}] : [];
  return claims.map((claim, index) => ({
    id: claim.member_id,
    name: data.members.find(member => member.id === claim.member_id)?.name || '团队成员',
    branch: index < 26 ? String.fromCharCode(65 + index) : String(index + 1),
    versions: (data.production_versions || []).filter(version => version.card_id === card.id && version.member_id === claim.member_id),
  }));
}

export function pendingReviewFeedback(data, card, doc) {
  if (!doc) return undefined;
  const own = data.current_member.id;
  const outputs = (data.production_versions || []).filter(result => result.card_id === card.id && result.member_id === own);
  const current = doc.versions.find(version => version.id === doc.currentVersion);
  const source = current?.status === 'draft' ? doc.versions[current.number - 2] : current;
  const matching = outputs.filter(result => result.version_id === source?.id);
  const feedback = (data.production_reviews || []).findLast(review =>
    review.card_id === card.id && review.verdict === 'revise' && review.id && review.note &&
    matching.some(output => output.result_revision === review.result_revision && (!review.production_version_id || review.production_version_id === output.version_id)) &&
    !doc.versions.some(version => version.reviewFeedback?.id === review.id));
  if (!feedback) return undefined;
  return {
    id: feedback.id,
    name: (data.members.find(member => member.id === feedback.member_id)?.name || '团队成员').slice(0,160),
    note: feedback.note,
  };
}
