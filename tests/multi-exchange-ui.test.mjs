import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = ['engine', 'ai', 'match', 'ui'].map(name =>
  readFileSync(new URL(`../site/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import\s+[^\n]+\n/gm, '')
    .replace(/^export\s+/gm, '')
).join('\n');

function setup(stockLimit = null) {
  const app = { innerHTML: '', listener: null, addEventListener(_, f) { this.listener = f; } };
  const ctx = createContext({
    document: { getElementById() { return app; } },
    window: { confirm: () => true, scrollTo() {} },
    setTimeout: () => 0, clearTimeout() {}
  });
  runInContext(source, ctx);
  runInContext(`
    start('local','tonpu');
    handoff = false;
    game.phase = 'adjustment';
    game.current = 0;
    game.adjustDone = [false, false];
    if (${stockLimit === null ? 'false' : 'true'}) game.stock = game.stock.slice(0, ${stockLimit ?? 0});
    resetTurnSelection();
    render();
    globalThis.fixtureGame = game;
    globalThis.fixtureIds = [...game.hands[0]];
  `, ctx);
  const click = (action, other = {}) => app.listener({ target: {
    closest: () => ({ dataset: { action, ...other } })
  } });
  return { app, game: ctx.fixtureGame, ids: ctx.fixtureIds, click, ctx };
}

test('adjustment can select all nine tiles, confirm once, and preserve hand count', () => {
  const { app, game, ids, click } = setup();
  assert.match(app.innerHTML, /選択 0 \/ 9/);
  assert.match(app.innerHTML, /手札を全選択（9枚）/);
  click('select-all-exchange');
  assert.match(app.innerHTML, /選択 9 \/ 9/);
  assert.match(app.innerHTML, /選んだ9枚を交換/);
  const stockBefore = game.stock.length;
  click('adjust-exchange');
  assert.equal(game.hands[0].length, 9);
  assert.equal(game.stock.length, stockBefore - 9);
  assert.deepEqual(game.discard.slice(), ids);
  assert.ok(game.hands[0].every(id => !ids.includes(id)));
});

test('adjustment permits more than two individual tile selections', () => {
  const { app, game, ids, click } = setup();
  for (const id of ids.slice(0, 5)) click('select', { id: String(id) });
  assert.match(app.innerHTML, /選択 5 \/ 9/);
  assert.match(app.innerHTML, /選んだ5枚を交換/);
  click('adjust-exchange');
  assert.equal(game.discard.length, 5);
  assert.equal(game.hands[0].length, 9);
});

test('adjustment only offers up to the available stock; no overflow', () => {
  const { app, game, ids, click } = setup(2);
  assert.match(app.innerHTML, /選択 0 \/ 2/);
  assert.match(app.innerHTML, /最大2枚を選択/);
  click('select-all-exchange');
  assert.match(app.innerHTML, /選択 2 \/ 2/);
  click('select', { id: String(ids[2]) }); // should not select a third
  assert.match(app.innerHTML, /選択 2 \/ 2/);
  click('adjust-exchange');
  assert.equal(game.stock.length, 0);
  assert.equal(game.phase, 'opening');
  assert.equal(game.hands[0].length, 9);
});

test('raise terminology replaces overwrite in player UI and help text', () => {
  const { app, ctx } = setup();
  assert.doesNotMatch(app.innerHTML, /上書き/);
  const home = runInContext('homeMarkup()', ctx);
  const help = runInContext('helpMarkup()', ctx);
  const panel = runInContext(`game.phase = 'opening'; game.board = {items:[{id:game.hands[0][0],a:1,b:2},{id:game.hands[0][1],a:2,b:3}],splitIndex:1}; game.openingRole = roleOf(game,game.hands[0].slice(0,2)); actionPanel()`, ctx);
  for (const html of [home, help, panel]) {
    assert.doesNotMatch(html, /上書き/);
    assert.match(html, /レイズ/);
  }
});
