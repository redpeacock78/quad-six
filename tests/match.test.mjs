import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, settleMatchGame, nextMatchGame, matchWinner, MATCH_FORMATS } from '../site/match.js';

function finish(m, { reason = 'exhaustion', winner = null, scores = [0,0] } = {}) {
  m.game.phase = 'finished';
  m.game.endReason = reason;
  m.game.endWinner = reason === 'early' ? winner : null;
  for (const [p, value] of scores.entries()) m.game.scores[p].role = value;
  return settleMatchGame(m);
}

test('one-game match transfers only score difference and never repeats', () => {
  const m = createMatch({format:'single',seed:1,startingPlayer:0});
  assert.deepEqual(m.points,[250,250]);
  assert.throws(()=>settleMatchGame(m),/終了/);
  assert.throws(()=>nextMatchGame(m),/終了/);
  const r=finish(m,{reason:'early',winner:0,scores:[119,84]});
  assert.deepEqual(r.points,[285,215]);
  assert.equal(r.honbaPoints,0);
  assert.equal(r.renchan,false);
  assert.equal(m.complete,true);
  assert.equal(m.history.length,1);
  assert.deepEqual(settleMatchGame(m).points,[285,215]);
  assert.equal(matchWinner(m),0);
  assert.throws(()=>nextMatchGame(m),/終了/);
});

test('scheduled dealer hands alternate on exhaustion and preserve 500 points', () => {
  for (const starter of [0,1]) for (const [format,n] of [['tonpu',4],['hanchan',8]]) {
    const m=createMatch({format,seed:1,startingPlayer:starter});
    assert.equal(MATCH_FORMATS[format].games,n);
    for(let i=0;i<n;i++) {
      assert.equal(m.handNumber,i+1);
      assert.equal(m.gameNumber,i+1);
      assert.equal(m.dealer,(starter+i)%2);
      assert.equal(m.game.current,(starter+i)%2);
      assert.equal(m.game.hands[0].length,9);
      assert.equal(m.game.hands[1].length,9);
      assert.equal(m.game.stock.length,38);
      const r=finish(m,{scores:[i===0?119:10,i===0?84:20]});
      assert.equal(r.renchan,false);
      assert.equal(r.honbaPoints,0);
      assert.equal(m.points[0]+m.points[1],500);
      assert.equal(m.complete,i===n-1);
      if(i<n-1) nextMatchGame(m,100+i);
    }
    assert.equal(m.history.length,n);
    assert.deepEqual(m.points,[285-(n-1)*10,215+(n-1)*10]);
    assert.equal(matchWinner(m),n===4?0:1);
  }
});

test('dealer early win extends a hand; child going out captures 5 x current honba', () => {
  const m=createMatch({format:'tonpu',seed:1,startingPlayer:0});
  const a=finish(m,{reason:'early',winner:0,scores:[40,20]});
  assert.equal(a.renchan,true);
  assert.equal(a.honba,0);
  assert.equal(a.honbaPoints,0);
  assert.equal(m.gameNumber,1);
  assert.equal(m.handNumber,1);
  assert.equal(m.honba,1);
  assert.equal(m.dealer,0);
  assert.equal(m.complete,false);
  nextMatchGame(m,2);
  assert.equal(m.gameNumber,2);
  assert.equal(m.game.lead,0);
  const b=finish(m,{reason:'early',winner:0,scores:[40,20]});
  assert.equal(b.honba,1);
  assert.equal(b.honbaPoints,5);
  assert.equal(m.game.scores[0].tableHonba,5);
  assert.equal(b.scores[0],45);
  assert.equal(m.honba,2);
  nextMatchGame(m,3);
  const c=finish(m,{reason:'early',winner:1,scores:[45,20]});
  assert.equal(c.earlyWinner,1);
  assert.equal(c.winner,0,'scoring winner may differ from the player who went out');
  assert.equal(c.honba,2);
  assert.equal(c.honbaPoints,10);
  assert.deepEqual(c.scores,[45,30]);
  assert.equal(c.renchan,false);
  assert.equal(m.handNumber,2);
  assert.equal(m.dealer,1);
  assert.equal(m.honba,0);
  assert.deepEqual(settleMatchGame(m),c,'settlement must be idempotent');
  assert.equal(m.game.scores[1].tableHonba,10);
  assert.equal(m.points[0]+m.points[1],500);
  nextMatchGame(m,4);
  assert.equal(m.game.lead,1);
});

test('the last scheduled hand may repeat beyond four or eight total games',()=>{
  for (const [format,count] of [['tonpu',4],['hanchan',8]]) {
    const m=createMatch({format,startingPlayer:1,seed:12});
    for(let i=1;i<count;i++) {
      finish(m);
      nextMatchGame(m,100+i);
    }
    assert.equal(m.handNumber,count);
    const parent=m.dealer;
    const result=finish(m,{reason:'early',winner:parent,scores:[20,10]});
    assert.equal(result.renchan,true);
    assert.equal(m.complete,false);
    assert.equal(m.handNumber,count);
    assert.equal(m.honba,1);
    nextMatchGame(m,99);
    assert.equal(m.gameNumber,count+1);
    assert.equal(m.game.lead,parent);
    const last=finish(m,{reason:'early',winner:1-parent});
    assert.equal(last.honbaPoints,5);
    assert.equal(m.complete,true);
    assert.equal(m.history.length,count+1);
    assert.equal(m.points[0]+m.points[1],500);
  }
});

test('mountain exhaustion resets honba and advances dealer; invalid winner rejects', () => {
  const m=createMatch({format:'tonpu',startingPlayer:0});
  assert.throws(()=>{m.game.phase='finished';m.game.endReason='early';settleMatchGame(m);},/判定/);
  m.game.endWinner=0;
  settleMatchGame(m);
  assert.equal(m.honba,1);
  nextMatchGame(m,3);
  const r=finish(m,{reason:'exhaustion'});
  assert.equal(r.honba,1);
  assert.equal(r.honbaPoints,0);
  assert.equal(m.honba,0);
  assert.equal(m.handNumber,2);
  assert.equal(m.dealer,1);
});

test('random first dealer remains overridable for deterministic tests',()=>{
  const random=Math.random;
  try {
    Math.random=()=>0.1;
    const m0=createMatch({seed:4});
    assert.equal(m0.initialStarter,0);
    Math.random=()=>0.9;
    const m1=createMatch({seed:4});
    assert.equal(m1.initialStarter,1);
    assert.equal(m1.game.current,1);
    assert.equal(createMatch({startingPlayer:0}).dealer,0);
    assert.throws(()=>createMatch({startingPlayer:2}),/親は0か1/);
    assert.throws(()=>createMatch({format:'invalid'}),/未対応/);
  } finally {Math.random=random;}
});

test('zero point transfers and negative balances do not end the match',()=>{
  const m=createMatch({format:'tonpu',startingPlayer:0});
  finish(m,{scores:[50,50]});
  assert.deepEqual(m.points,[250,250]);
  nextMatchGame(m,2);
  finish(m,{scores:[0,300]});
  assert.deepEqual(m.points,[-50,550]);
  assert.equal(m.complete,false);
});
