import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, settleMatchGame, nextMatchGame, matchWinner, MATCH_FORMATS } from '../site/match.js';

const finishWithScores = (m, x, y) => {
  m.game.phase = 'finished';
  m.game.endReason = 'early';
  for (const [p, score] of [x, y].entries()) m.game.scores[p].role = score;
  return settleMatchGame(m);
};

test('single game settles 119 vs 84 -> 285 vs 215, once only', () => {
  const m = createMatch({format:'single',seed:1});
  assert.deepEqual(m.points, [250,250]);
  assert.deepEqual([m.game.current,m.game.lead],[0,0]);
  assert.throws(()=>settleMatchGame(m),/終了/);
  assert.throws(()=>nextMatchGame(m),/終了/);
  assert.deepEqual(finishWithScores(m,119,84).points,[285,215]);
  assert.deepEqual(settleMatchGame(m).points,[285,215]);
  assert.deepEqual(m.points,[285,215]);
  assert.equal(m.history.length,1);
  assert.equal(m.complete,true);
  assert.equal(matchWinner(m),0);
  assert.throws(()=>nextMatchGame(m),/終了/);
});

test('four / eight games alternate opening leads and preserve 500 points', () => {
  for(const [format, n] of [['tonpu',4],['hanchan',8]]) {
    const m = createMatch({format,seed:1});
    assert.equal(MATCH_FORMATS[format].games,n);
    for(let i=0;i<n;i++) {
      assert.equal(m.gameNumber,i+1);
      assert.equal(m.game.lead,i%2);
      assert.equal(m.game.current,i%2);
      assert.equal(m.game.hands[0].length,9);
      assert.equal(m.game.hands[1].length,9);
      assert.equal(m.game.stock.length,38);
      finishWithScores(m, i===0 ? 119 : 10, i===0 ? 84 : 20);
      assert.equal(m.points[0]+m.points[1],500);
      assert.equal(m.complete,i===n-1);
      if(i<n-1) nextMatchGame(m,100+i);
    }
    assert.equal(m.history.length,n);
    assert.deepEqual(m.points,[285 - (n-1)*10, 215+(n-1)*10]);
    assert.equal(matchWinner(m),n===4?0:1);
  }
});

test('ties transfer zero points and no sudden death on negative points', () => {
  const m = createMatch({format:'tonpu'});
  finishWithScores(m,50,50);
  assert.deepEqual(m.points,[250,250]);
  nextMatchGame(m,2);
  finishWithScores(m,0,300);
  assert.deepEqual(m.points,[-50,550]);
  assert.equal(m.complete,false);
  nextMatchGame(m,3);
  assert.equal(m.gameNumber,3);
  assert.throws(()=>createMatch({format:'unknown'}),/未対応/);
});
