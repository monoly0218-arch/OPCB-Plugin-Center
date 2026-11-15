import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDirectory} from '../src/plugin-center/directory.mjs';
import {createContributionReader} from '../src/plugin-center/contributors.mjs';

test('native directory and contributor requests satisfy GitHub User-Agent admission', async () => {
  const registry = JSON.parse(await readFile(new URL('../REGISTRY.json', import.meta.url)));
  const head = 'a'.repeat(40), urls = [];
  const request = async ({url, headers}) => {
    if (!headers?.['User-Agent']) return {status: 403, body: 'Request forbidden. Please make sure your request has a User-Agent header'};
    assert.equal(headers.Accept, 'application/vnd.github+json');
    assert.equal(headers.Authorization, undefined);
    urls.push(url);
    let value;
    if (url.endsWith('/commits/main')) value = {sha: head};
    else if (url.endsWith(`/contents/REGISTRY.json?ref=${head}`)) value = {encoding: 'base64', content: Buffer.from(JSON.stringify(registry)).toString('base64')};
    else if (url.includes('/pulls?') || url.includes('/commits?')) value = [];
    else throw Error(url);
    return {status: 200, body: JSON.stringify(value)};
  };
  const directory = await loadDirectory(request);
  assert.equal(directory.commit, head);
  assert(directory.entries.length > 0);
  await createContributionReader(request)(directory.entries, () => true, head);
  assert.equal(urls.length, 4);
});

test('only confirmed rate limiting tells the user to wait and refresh', async () => {
  for (const response of [
    {status: 429, body: '{}'},
    {status: 403, headers: {'X-RateLimit-Remaining': '0'}, body: '{}'},
    {status: 403, headers: {'retry-after': '60'}, body: '{}'},
    {status: 403, body: '{"message":"API rate limit exceeded"}'},
    {status: 403, body: '{"message":"You have exceeded a secondary rate limit"}'},
  ]) await assert.rejects(loadDirectory(async () => response), /暂时限制访问/);
  for (const body of ['Request forbidden. Please make sure your request has a User-Agent header', '{"message":"Resource not accessible"}']) {
    await assert.rejects(loadDirectory(async () => ({status: 403, body})), error => {
      assert.match(error.message, /拒绝目录请求（403）/);
      assert.doesNotMatch(error.message, /稍后刷新/);
      return true;
    });
  }
  await assert.rejects(loadDirectory(async () => ({status: 503, body: 'unavailable'})), /目录读取失败（503）/);
});
