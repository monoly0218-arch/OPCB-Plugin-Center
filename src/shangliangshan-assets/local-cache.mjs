import {assetMediaUrl} from './model.mjs';

// Keep the schema independent from the installed plugin release. Only the
// previously authorized browse projection and small covers are stored.
const prefix = 'opcb.shangliangshan-assets.cache.v1';
const maxAge = 7 * 24 * 60 * 60 * 1000;
const catalogLimit = 1_400_000;
const coverLimit = 720_000;
const jpeg = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const coverSource = /^https:\/\/staging\.paolab\.cn\/assets\/api\/assets\/files\/[a-f0-9-]+\/(preview|poster)$/;
const safeCover = raw => {
  const source = assetMediaUrl(raw);
  return source && coverSource.test(source) ? source : undefined;
};
const fields = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));

export function createAssetCache(binding, {storage, now = Date.now} = {}) {
  const key = binding && [prefix, binding.community, binding.owner, binding.member].map(encodeURIComponent).join(':');
  const coverKey = key + ':covers';
  let covers;
  let timer;
  const get = id => { try { return (storage || globalThis.localStorage)?.getItem(id); } catch { return null; } };
  const put = (id, value) => { try { (storage || globalThis.localStorage)?.setItem(id, value); } catch { /* No local storage or quota. */ } };
  const remove = id => { try { (storage || globalThis.localStorage)?.removeItem(id); } catch { /* Local storage unavailable. */ } };
  const validTime = time => Number.isFinite(time) && time <= now() && now() - time <= maxAge;
  function clear() {
    if (!key) return;
    clearTimeout(timer);
    timer = undefined;
    covers = {};
    remove(key);
    remove(coverKey);
  }
  function read() {
    if (!key) return null;
    try {
      const raw = get(key);
      if (!raw) return null;
      if (raw.length > catalogLimit) throw Error('cache size');
      const {at, data} = JSON.parse(raw);
      if (!validTime(at) || data?.user?.id !== binding.member || !Array.isArray(data.assets) || !Array.isArray(data.files)) throw Error('cache scope');
      return {...data, user: {...data.user, role: 'viewer', capabilities: {}}};
    } catch {
      clear();
      return null;
    }
  }
  function write(data) {
    if (!key || data.user?.id !== binding.member) return;
    const projection = {
      revision: data.revision,
      user: fields(data.user, ['id', 'name', 'initial', 'folderRights']),
      assets: data.assets.map(asset => ({
        ...fields(asset, ['id', 'title', 'revision', 'createdBy', 'createdById', 'createdAt', 'updatedAt', 'assetDate', 'category', 'topic', 'status', 'tags', 'trashed', 'folderIds']),
        versions: asset.versions.map(version => ({
          ...fields(version, ['number', 'fileIds', 'createdAt']),
          ...(version.mediaItems ? {mediaItems: version.mediaItems.map(item => fields(item, ['kind', 'image', 'video', 'document']))} : {}),
        })),
        publications: (asset.publications || []).map(item => fields(item, ['platform', 'version', 'createdAt', 'publishedAt'])),
      })),
      files: data.files.map(file => ({...fields(file, ['id', 'kind', 'bytes']), url: safeCover(file.url), poster: safeCover(file.poster)})),
      folders: (data.folders || []).map(folder => fields(folder, ['id', 'name'])),
      governance: {tags: (data.governance?.tags || []).map(tag => fields(tag, ['id', 'name', 'group', 'count']))},
    };
    const raw = JSON.stringify({at: now(), data: projection});
    if (raw.length <= catalogLimit) put(key, raw);
    else clear();
  }
  function thumbnails() {
    if (covers) return covers;
    try {
      const raw = get(coverKey);
      const parsed = raw && raw.length <= coverLimit + 5000 && JSON.parse(raw);
      covers = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { covers = {}; }
    return covers;
  }
  function flush() {
    if (!key || !timer) return;
    clearTimeout(timer);
    timer = undefined;
    put(coverKey, JSON.stringify(thumbnails()));
  }
  function saveSoon() {
    clearTimeout(timer);
    timer = setTimeout(flush, 100);
  }
  return {
    read, write, clear, flush,
    cover(source) {
      if (!key || !coverSource.test(source)) return undefined;
      const image = thumbnails()[source];
      return validTime(image?.at) && typeof image.url === 'string' && image.url.length <= 25000 && jpeg.test(image.url) ? image.url : undefined;
    },
    storeCover(source, url) {
      if (!key || !coverSource.test(source) || typeof url !== 'string' || url.length > 25000 || !jpeg.test(url)) return;
      const items = thumbnails();
      delete items[source];
      items[source] = {url, at: now()};
      const entries = Object.entries(items);
      let size = entries.reduce((sum, [id, image]) => sum + id.length + (image?.url?.length || 0) + 40, 0);
      for (const [id, image] of entries) {
        if (size <= coverLimit) break;
        size -= id.length + (image?.url?.length || 0) + 40;
        delete items[id];
      }
      saveSoon();
    },
    pruneCovers(allowed) {
      if (!key) return;
      const items = thumbnails();
      let changed = false;
      for (const source of Object.keys(items)) {
        if (!Object.hasOwn(allowed, source) || !validTime(items[source]?.at)) {
          delete items[source];
          changed = true;
        }
      }
      if (changed) saveSoon();
    },
  };
}

export async function makeAssetCover(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d', {alpha: false}).drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.66);
}
