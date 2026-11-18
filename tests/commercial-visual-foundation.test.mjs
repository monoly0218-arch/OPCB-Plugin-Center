import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

test('the lightweight stylesheet retains workbench tokens and layout without embedded Chinese fonts', async () => {
  const css = await readFile(new URL('../src/commercial/layout.css', import.meta.url), 'utf8');
  const {code} = await transform(css, {loader: 'css'});
  const theme = selector => code.split(selector + ' {')[1]?.split('}')[0] || '';

  for (const token of ['--paper:', '--card:', '--text:', '--line:']) {
    assert.ok(theme('.commercial-v3').includes(token), 'light theme is missing ' + token);
    assert.ok(theme('.commercial-v3[data-theme=dark]').includes(token), 'dark theme is missing ' + token);
  }
  assert.match(theme('.commercial-v3 .shell'), /display:\s*(?:grid|flex)/);
  assert.ok(theme('.commercial-v3 .brand').length > 0, 'missing brand styles');
  assert.doesNotMatch(code, /font-family:\s*RoundSC/);
});
