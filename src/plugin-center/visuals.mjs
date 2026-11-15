// All OPCB identities share the selected 3dicons V1 collection.
import {IDENTITY_ICONS} from '../identity-icons/icons.mjs';
export const ICONS=Object.freeze({"opcb.chat-artifacts": "folder", "opcb.company-board": "flag", "opcb.content-factory": "video-cam", "opcb.grokbot-bridge": "chat-text", "opcb.higgsfield-mailbox": "mail", "opcb.hot-workflow": "fire", "opcb.html-reader": "file-text", "opcb.knowledge": "notebook", "opcb.knowledge-admin": "shield", "opcb.mobile-design": "mobile", "opcb.muse-link": "mic", "opcb.plugin-center": "puzzle", "opcb.results-report": "chart", "opcb.shangliangshan-assets": "picture", "opcb.shangliangshan-ecommerce": "bag", "opcb.task-center": "tick", "opcb.xhs-topic-burst": "bulb"});
export const iconName=id=>ICONS[id]||'puzzle';
export const pluginIcon=(entry,assets)=>IDENTITY_ICONS[entry.id]||entry.icon||assets[entry.id]||assets[iconName(entry.id)]||assets.puzzle;
// Date-stamped snapshots remain date-stamped; never invent a semantic release.
export function versionLabel(version) {
 return /^\d{4}-\d{2}-\d{2}(?:-|$)/.test(version) ? version.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1.$2.$3') : `v${version}`;
}
