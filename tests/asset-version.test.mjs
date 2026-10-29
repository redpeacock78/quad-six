import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSite = name => readFileSync(new URL(`../site/${name}`, import.meta.url), 'utf8');

test('entrypoint and all game modules use the same cache-busting asset version', () => {
  const html = readSite('index.html');
  const match = html.match(/src="\.\/ui\.js\?v=([^"]+)"/);
  assert.ok(match, 'the HTML entrypoint must version its game script');
  const version = match[1];
  assert.match(html, new RegExp(`href="\\./style\\.css\\?v=${version}"`));

  const ui = readSite('ui.js');
  const ai = readSite('ai.js');
  const matchModule = readSite('match.js');
  for (const [source, dependencies] of [
    [ui, ['engine', 'ai', 'match']],
    [ai, ['engine']],
    [matchModule, ['engine']]
  ]) {
    for (const dependency of dependencies) {
      assert.ok(source.includes(`from './${dependency}.js?v=${version}'`),
        `${dependency}.js dependency must use the same version as the entrypoint`);
    }
  }
});

test('standalone bundler supports versioned script URL and contains current graph renderer', () => {
  const script = readFileSync(new URL('../scripts/build-standalone.mjs', import.meta.url), 'utf8');
  assert.match(script, /src=.*ui/);
  assert.match(script, /\?:/);
  const offline = readSite('standalone.html');
  assert.match(offline, /function branchingBoardMarkup\(/);
  assert.match(offline, /function boardPorts\(/);
  assert.match(offline, /function formatMove\(/);
  assert.doesNotMatch(offline, /<script type="module" src=/);
});
