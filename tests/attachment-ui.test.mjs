import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInContext, createContext } from 'node:vm';

const sources = ['engine', 'ai', 'match', 'ui'].map(name =>
  readFileSync(new URL(`../site/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import\s+[^\n]+\n/gm, '')
    .replace(/^export\s+/gm, '')
).join('\n');

function stageAttachment(tileKind) {
  const app = { innerHTML: '', listener: null,
    addEventListener(name, fn) { if (name === 'click') this.listener = fn; } };
  const context = createContext({
    document: { getElementById() { return app; } },
    window: { confirm: () => true, scrollTo() {} },
    setTimeout: () => 0, clearTimeout() {},
  });
  runInContext(sources, context);
  // Both chosen copies are in hand, and the board has ends 4 (left) and 3 (right).
  runInContext(`
    start('local', 'single');
    handoff = false;
    const copies = game.tiles.filter(t => tileKey(t) === ${JSON.stringify(tileKind)}).map(t => t.id);
    const tileId = key => game.tiles.find(t => tileKey(t) === key).id;
    game.current = 0;
    game.phase = 'attachment';
    game.hands[0] = copies;
    game.board = { items: [
      { id: tileId('0-4'), a: 4, b: 0 },
      { id: tileId('0-5'), a: 0, b: 5 },
      { id: tileId('3-5'), a: 5, b: 3 }
    ], splitIndex: 1 };
    resetTurnSelection();
    render();
    globalThis.fixtureIds = copies;
    globalThis.fixtureGame = game;
    globalThis.availableMoves = () => attachmentMoves(game, selected);
  `, context);
  const click = (action, values = {}) => {
    assert.ok(app.listener);
    app.listener({ target: { closest: () => ({ dataset: { action, ...values } }) } });
  };
  return { app, click, ids: context.fixtureIds, game: context.fixtureGame, moves: context.availableMoves };
}

test('attachment options select but never immediately place tiles', () => {
  const { app, click, ids, game, moves } = stageAttachment('3-4');
  click('select', { id: String(ids[0]) });
  click('select', { id: String(ids[1]) });
  assert.equal((app.innerHTML.match(/data-action="choose-attachment"/g) || []).length, 2);
  assert.match(app.innerHTML, /data-action="attach" disabled/);
  click('attach'); // even a forged disabled-button click must not move
  assert.equal(game.hands[0].length, 2);
  const right = moves().find(move => move.side === 'right');
  assert.ok(right);
  click('choose-attachment', { key: right.key });
  assert.equal(game.hands[0].length, 2, 'tapping a connection only selects it');
  assert.match(app.innerHTML, /move-option chosen/);
  assert.match(app.innerHTML, /data-action="attach" >付札を場に出す/);
  click('attach');
  assert.equal(game.hands[0].length, 0);
  assert.equal(game.scores[0].pips, 14);
  assert.equal(game.phase, 'finished');
});

test('changing tiles cancels an old connection choice', () => {
  const { app, click, ids, game, moves } = stageAttachment('3-4');
  click('select', { id: String(ids[0]) });
  click('select', { id: String(ids[1]) });
  const right = moves().find(move => move.side === 'right');
  click('choose-attachment', { key: right.key });
  click('select', { id: String(ids[1]) });
  assert.equal(game.hands[0].length, 2);
  click('choose-attachment', { key: right.key }); // stale two-tile move must be ignored
  assert.equal(game.hands[0].length, 2);
  click('select', { id: String(ids[1]) });
  assert.match(app.innerHTML, /data-action="attach" disabled/);
});

test('a single legal connection auto-selects, but still needs confirmation', () => {
  const { app, click, ids, game } = stageAttachment('4-4');
  click('select', { id: String(ids[0]) });
  click('select', { id: String(ids[1]) });
  assert.equal((app.innerHTML.match(/data-action="choose-attachment"/g) || []).length, 1);
  assert.match(app.innerHTML, /move-option chosen/);
  assert.doesNotMatch(app.innerHTML, /data-action="attach" disabled/);
  assert.equal(game.hands[0].length, 2);
  click('attach');
  assert.equal(game.hands[0].length, 0);
  assert.equal(game.scores[0].pips, 16);
  assert.equal(game.phase, 'finished');
});
