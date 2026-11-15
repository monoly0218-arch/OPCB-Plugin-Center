// Brand/IP artwork takes priority; generic functions retain the selected Fluent set.
export const ICONS = Object.freeze({
 'opcb.chat-artifacts':'speech-balloon',
 'opcb.company-board':'briefcase',
 'opcb.content-factory':'clapper-board',
 'opcb.grokbot-bridge':'robot',
 'opcb.higgsfield-mailbox':'incoming-envelope',
 'opcb.hot-workflow':'fire',
 'opcb.html-reader':'globe',
 'opcb.knowledge':'open-book',
 'opcb.knowledge-admin':'shield',
 'opcb.muse-link':'headphone',
 'opcb.plugin-center':'puzzle',
 'opcb.results-report':'bar-chart',
 'opcb.shangliangshan-assets':'framed-picture',
 'opcb.shangliangshan-ecommerce':'shopping-bags',
 'opcb.task-center':'check-mark',
 'opcb.xhs-topic-burst':'light-bulb',
});
export const iconName = id => ICONS[id] || 'puzzle';
// Future directory releases can provide official artwork without a center update.
export const pluginIcon = (entry, assets) => entry.icon || assets[entry.id] || assets[iconName(entry.id)] || assets.puzzle;
// Date-stamped snapshots remain date-stamped; never invent a semantic release.
export function versionLabel(version) {
 return /^\d{4}-\d{2}-\d{2}(?:-|$)/.test(version) ? version.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1.$2.$3') : `v${version}`;
}
