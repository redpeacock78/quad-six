import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, attachmentMoves, dispatch, tileKey } from '../site/engine.js';

function stagedGame(selectedKey = '3-4') {
  const game = newGame({ seed: 29, startingPlayer: 0 });
  const find = key => game.tiles.filter(tile => tileKey(tile) === key).map(tile => tile.id);
  const ids = find(selectedKey);
  assert.equal(ids.length, 2, 'the double-six set has two copies per tile kind');

  // A legal chain with exposed left 4 and right 3, without using either
  // copy of the selected [3|4] (or [4|4]) tile.
  const boardTiles = ['0-4', '0-5', '3-5'].map(key => find(key)[0]);
  game.board = {
    items: [
      { id: boardTiles[0], a: 4, b: 0 },
      { id: boardTiles[1], a: 0, b: 5 },
      { id: boardTiles[2], a: 5, b: 3 }
    ],
    splitIndex: 1
  };
  game.hands = [ids, []];
  game.stock = game.tiles.map(t => t.id)
    .filter(id => !ids.includes(id) && !boardTiles.includes(id));
  game.current = 0;
  game.phase = 'attachment';
  return { game, ids };
}

test('two identical [3|4] tiles give only left and right choices', () => {
  const { game, ids } = stagedGame('3-4');
  const moves = attachmentMoves(game, ids);
  assert.equal(moves.length, 2);
  assert.deepEqual(moves.map(m => m.side).sort(), ['left', 'right']);
  assert.equal(new Set(moves.map(m => m.key)).size, 2);
  assert.deepEqual(moves.find(m => m.side === 'right').placements.map(p => [p.a, p.b]),
    [[3, 4], [4, 3]]);
  assert.deepEqual(moves.find(m => m.side === 'left').placements.map(p => [p.a, p.b]),
    [[4, 3], [3, 4]]);
  const reversed = attachmentMoves(game, [...ids].reverse());
  assert.equal(reversed.length, 2, 'selection order must not double candidate count');
});

test('deduplicated action keys still play both physical tile copies and score 14', () => {
  const { game, ids } = stagedGame('3-4');
  const move = attachmentMoves(game, ids).find(m => m.side === 'right');
  dispatch(game, { type: 'attach', ids, moveKey: move.key });
  assert.equal(game.hands[0].length, 0);
  assert.equal(game.scores[0].pips, 14);
  assert.equal(game.phase, 'finished');
  assert.equal(game.endWinner, 0);
  assert.equal(game.board.items.length, 5);
  assert.deepEqual(game.board.items.slice(-2).map(p => [p.a, p.b]),
    [[3, 4], [4, 3]]);
});

test('two identical double tiles are not listed twice either', () => {
  // A distinct starting chain is needed to keep both [4|4] copies in hand.
  const { game, ids } = stagedGame('4-4');
  const moves = attachmentMoves(game, ids);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].side, 'left');
  assert.deepEqual(moves[0].placements.map(p => [p.a, p.b]), [[4, 4], [4, 4]]);
});

test('a single selected tile retains independent left and right options', () => {
  const { game, ids } = stagedGame('3-4');
  const moves = attachmentMoves(game, [ids[0]]);
  assert.deepEqual(moves.map(m => m.side).sort(), ['left', 'right']);
});
