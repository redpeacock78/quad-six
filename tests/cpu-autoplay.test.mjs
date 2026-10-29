import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../site/engine.js';
import { chooseAIAction } from '../site/ai.js';
import { createMatch, settleMatchGame, nextMatchGame } from '../site/match.js';

// End-to-end regression for CPU errors caused by a legal move being rejected.
// The AI controls BOTH seats, so the test covers whole East matches without UI timing.
test('CPU vs CPU completes 64 East matches without illegal move keys or stalled turns', () => {
  let played = 0;
  let twoTileAttachments = 0;
  for (let seed = 1; seed <= 64; seed++) {
    const match = createMatch({
      format: 'tonpu', mode: 'cpu', seed, startingPlayer: seed % 2
    });
    for (let turn = 0; turn < 3000 && !match.complete; turn++) {
      const game = match.game;
      if (game.phase === 'finished') {
        settleMatchGame(match);
        assert.equal(match.points[0] + match.points[1], 500);
        if (!match.complete) nextMatchGame(match, seed * 10000 + turn);
        continue;
      }
      const player = game.current;
      const action = chooseAIAction(game);
      assert.ok(action, `CPU returned no action at seed ${seed}, turn ${turn}, phase ${game.phase}`);
      assert.doesNotThrow(() => dispatch(game, action),
        `CPU produced invalid action at seed ${seed}, turn ${turn}, player ${player}, phase ${game.phase}: ${JSON.stringify(action)}`);
      if (action.type === 'attach' && action.ids.length === 2) twoTileAttachments++;
      played++;
    }
    assert.ok(match.complete, `CPU did not finish East match for seed ${seed}`);
    assert.equal(match.handNumber, 5);
    assert.equal(match.history.length, match.gameNumber);
    assert.equal(match.points[0] + match.points[1], 500);
  }
  assert.ok(played > 1000);
  assert.ok(twoTileAttachments > 100);
});
