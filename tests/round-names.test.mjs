import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, nextMatchGame, settleMatchGame, matchRoundName } from '../site/match.js';

function finish(match, {earlyWinner = null} = {}) {
  match.game.phase = 'finished';
  match.game.endReason = earlyWinner === null ? 'exhaustion' : 'early';
  match.game.endWinner = earlyWinner;
  return settleMatchGame(match);
}

test('east round labels apply to all four tonpu dealer hands', () => {
  assert.deepEqual(Array.from({length:4},(_,i)=>matchRoundName('tonpu',i+1)),
    ['東1局 0本場','東2局 0本場','東3局 0本場','東4局 0本場']);
  assert.equal(matchRoundName('single',1),'一局戦');
});

test('hanchan runs East 1-4 then South 1-4', () => {
  const names = Array.from({length:8},(_,i)=>matchRoundName('hanchan',i+1));
  assert.deepEqual(names,[
    '東1局 0本場','東2局 0本場','東3局 0本場','東4局 0本場',
    '南1局 0本場','南2局 0本場','南3局 0本場','南4局 0本場'
  ]);
});

test('renchan increments honba without changing wind or round number', () => {
  const m=createMatch({format:'tonpu',seed:30,startingPlayer:0});
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'東1局 0本場');
  const first=finish(m,{earlyWinner:0});
  assert.equal(first.hand,1);
  nextMatchGame(m,31);
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'東1局 1本場');
  const second=finish(m,{earlyWinner:0});
  assert.equal(second.honba,1);
  nextMatchGame(m,32);
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'東1局 2本場');
  finish(m,{earlyWinner:1});
  nextMatchGame(m,33);
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'東2局 0本場');
});

test('South 4 renchan keeps 南4局 and only ends once the dealer changes', () => {
  const m=createMatch({format:'hanchan',seed:10,startingPlayer:0});
  for(let i=0;i<7;i++) {
    finish(m);
    nextMatchGame(m,20+i);
  }
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'南4局 0本場');
  finish(m,{earlyWinner:m.dealer});
  nextMatchGame(m,90);
  assert.equal(matchRoundName(m.format,m.handNumber,m.honba),'南4局 1本場');
  finish(m);
  assert.equal(m.complete,true);
});

test('out-of-range hand numbers are rejected rather than silently wrapping', () => {
  assert.throws(()=>matchRoundName('tonpu',5),/範囲外/);
  assert.throws(()=>matchRoundName('hanchan',9),/範囲外/);
  assert.throws(()=>matchRoundName('hanchan',0),/範囲外/);
  assert.throws(()=>matchRoundName('tonpu',1,-1),/不正/);
  assert.throws(()=>matchRoundName('unknown',1),/未対応/);
});
