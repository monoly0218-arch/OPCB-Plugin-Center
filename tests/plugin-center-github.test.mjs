import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDirectory, CATALOG_REFERENCE, GITEE_GIT, entryLinks} from '../src/plugin-center/directory.mjs';
import {githubDirectoryError} from '../src/plugin-center/github.mjs';

test('Gitee directory uses a public branch and a single immutable catalog commit', async () => {
  const registry = JSON.parse(await readFile(new URL('../REGISTRY.json', import.meta.url)));
  const head = 'a'.repeat(40);
  const urls = [];
  const request = async ({url, headers}) => {
    assert.equal(headers.Authorization, undefined);
    assert.equal(new URL(url).origin, 'https://gitee.com');
    urls.push(url);
    const value = url.endsWith('/branches/' + encodeURIComponent(CATALOG_REFERENCE))
      ? {commit: {sha: head}}
      : {encoding: 'base64', content: Buffer.from(JSON.stringify(registry)).toString('base64')};
    return {status: 200, body: JSON.stringify(value)};
  };
  const directory = await loadDirectory(request);
  assert.equal(directory.commit, head);
  assert(directory.entries.length > 0);
  assert(directory.entries.every(entry => entry.reviewSource.repository === GITEE_GIT));
  assert(urls[1].endsWith('/contents/REGISTRY.json?ref=' + head));
  assert.match(entryLinks(directory.entries[0], head).download, new RegExp(/gitee\.com.*\/raw\//.source + head + '/'));
  assert.equal(urls.length, 2);
});

test('Gitee access errors retain the status and distinguish rate limiting', async () => {
  await assert.rejects(loadDirectory(async () => ({status: 429})), /Gitee 暂时限制访问/);
  await assert.rejects(loadDirectory(async () => ({status: 403})), /Gitee 目录读取失败（403）/);
  assert.match(githubDirectoryError({status: 403, headers: {'x-ratelimit-remaining': '0'}}), /暂时限制访问/);
  assert.match(githubDirectoryError({status: 403, body: 'Missing User-Agent'}), /拒绝目录请求/);
});
