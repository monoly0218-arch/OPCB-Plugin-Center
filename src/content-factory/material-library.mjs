import {attachment} from './production-model.mjs';

const marker = 'opcb-factory-library';
const block = /```opcb-factory-library\n([\s\S]*?)\n```/g;

export function validateLibrary(doc) {
  if (!doc || doc.schema !== 1 || doc.kind !== 'opcb.factory.library' ||
      !/^[a-f0-9]{64}$/.test(doc.owner) || !Number.isSafeInteger(doc.revision) || doc.revision < 0 ||
      !Array.isArray(doc.entries) || doc.entries.length > 250) throw Error('角色／产品库资料无效');
  const ids = new Set();
  for (const entry of doc.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 240 || ids.has(entry.id) ||
        !['person', 'product'].includes(entry.kind) || typeof entry.name !== 'string' ||
        !entry.name.trim() || entry.name.length > 160 || !Array.isArray(entry.files) ||
        !entry.files.length || entry.files.length > 20) throw Error('图库条目信息不完整');
    ids.add(entry.id);
    entry.files.forEach(file => {
      if (!attachment(file).type.startsWith('image/')) throw Error('角色／产品库只收图片');
    });
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 220000) throw Error('图库容量已满');
  return doc;
}

export function readLibrary(event) {
  const content = event?.content || '', matches = [...content.matchAll(block)];
  if (!matches.length) {
    if (content.includes('```' + marker)) throw Error('图库资料标记损坏');
    return null;
  }
  if (matches.length !== 1) throw Error('同一会话存在重复图库资料');
  return validateLibrary(JSON.parse(matches[0][1]));
}

export function libraryContent(original, doc) {
  validateLibrary(doc);
  const text = '```' + marker + '\n' + JSON.stringify(doc) + '\n```';
  return [...String(original || '').matchAll(block)].length
    ? original.replace(block, () => text)
    : String(original || '').trimEnd() + '\n\n' + text;
}

export function libraryChoices(doc, version, kind) {
  const entries = (doc?.entries || []).filter(entry => entry.kind === kind);
  const complete = entries.filter(entry => entry.files.every(file => (version?.materials || []).some(material => material.kind === kind && material.sha256 === file.sha256)));
  const known = new Set(complete.flatMap(entry => entry.files.map(file => file.sha256)));
  const retained = (version?.materials || []).filter(file => file.kind === kind && !known.has(file.sha256));
  return [...entries, ...retained.map(file => ({id: 'retained:' + kind + ':' + file.sha256, kind, name: file.name, files: [file]}))];
}

export function selectedMaterials(entries, selected, retained = []) {
  if(selected.some(id => !entries.some(entry => entry.id === id)))throw Error('所选图库条目已变化，请重新勾选后执行');
  const files = entries.filter(entry => selected.includes(entry.id))
    .flatMap(entry => entry.files.map(file => ({...attachment(file), kind: entry.kind, libraryId: entry.id, libraryName: entry.name})));
  const unique = new Map([...retained, ...files].map(file => [file.kind + ':' + file.sha256, file]));
  if (unique.size > 40) throw Error('每版最多40个物料，请减少勾选');
  return [...unique.values()];
}
