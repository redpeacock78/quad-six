import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch } from '../site/engine.js';
import { chooseAIAction } from '../site/ai.js';

function adjustment(seed = 42) {
  const game = newGame({ seed, startingPlayer: 0 });
  game.phase = 'adjustment';
  game.current = 0;
  return game;
}

test('poker-style exchange can replace the entire hand in a single action', () => {
  const game = adjustment();
  const oldHand = [...game.hands[0]];
  const oldStock = game.stock.length;
  const oldDiscard = game.discard.length;
  dispatch(game, { type: 'adjust', choice: 'exchange', ids: [...oldHand] });
  assert.equal(game.hands[0].length, oldHand.length);
  assert.equal(game.stock.length, oldStock - oldHand.length);
  assert.deepEqual(game.discard.slice(oldDiscard), oldHand);
  assert.ok(game.hands[0].every(id => !oldHand.includes(id)));
  assert.equal(new Set(game.hands[0]).size, oldHand.length);
  assert.equal(game.adjustDone[0], true);
  assert.equal(game.current, 1);
  assert.match(game.history[0].text, /9枚公開交換/);
});

test('exchange of several selected tiles preserves all other tiles', () => {
  const game = adjustment();
  const oldHand = [...game.hands[0]];
  dispatch(game, { type: 'adjust', choice: 'exchange', ids: oldHand.slice(2, 6) });
  assert.equal(game.hands[0].length, oldHand.length);
  assert.deepEqual(game.hands[0].slice(0, 5), [...oldHand.slice(0, 2), ...oldHand.slice(6)]);
  assert.equal(game.discard.length, 4);
  assert.equal(game.stock.length, 34);
});

test('invalid multi-exchanges are rejected atomically', () => {
  const cases = [
    { ids: [] }, { ids: [0, 0] }, { ids: [99] },
    { ids: [123456] }, { ids: 'not an array' }
  ];
  for (const { ids } of cases) {
    const game = adjustment();
    const snapshot = JSON.stringify(game);
    assert.throws(() => dispatch(game, { type: 'adjust', choice: 'exchange', ids }));
    assert.equal(JSON.stringify(game), snapshot);
  }
  const game = adjustment();
  game.stock = game.stock.slice(0, 2);
  const snapshot = JSON.stringify(game);
  assert.throws(() => dispatch(game, { type: 'adjust', choice: 'exchange', ids: game.hands[0].slice(0, 3) }), /山札は残り2枚/);
  assert.equal(JSON.stringify(game), snapshot);
});

test('exact stock exhaustion by exchange enters final opening after all replacement draws', () => {
  const game = adjustment();
  game.stock = game.stock.slice(0, 3);
  const old = [...game.hands[0]];
  dispatch(game, { type: 'adjust', choice: 'exchange', ids: old.slice(0, 3) });
  assert.equal(game.stock.length, 0);
  assert.equal(game.final, true);
  assert.equal(game.phase, 'opening');
  assert.equal(game.hands[0].length, 9);
  assert.equal(game.adjustDone[0], true);
  assert.equal(game.lastDrawBy, 0);
  assert.equal(game.lastDrawExempt, false);
  assert.equal(game.current, game.lead);
});

test('legacy one-tile exchange works, but no-exchange is rejected atomically', () => {
  const game = adjustment();
  const id = game.hands[0][0];
  dispatch(game, { type: 'adjust', choice: 'exchange', id });
  assert.ok(!game.hands[0].includes(id));
  assert.equal(game.hands[0].length, 9);
  const other = adjustment(43);
  const snapshot=JSON.stringify(other);
  assert.throws(()=>dispatch(other,{type:'adjust',choice:'none'}),/1枚ドローか交換/);
  assert.equal(JSON.stringify(other),snapshot);
});

test('CPU adjustment action never requests more replacements than stock', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const game = adjustment(seed);
    game.current = 1;
    game.stock = game.stock.slice(0, 1 + seed % 9);
    const action = chooseAIAction(game);
    assert.ok(action);
    assert.notEqual(action.choice,'none');
    assert.doesNotThrow(() => dispatch(game, action), `seed ${seed}`);
  }
});
