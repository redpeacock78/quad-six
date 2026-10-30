import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,dispatch,attachmentMoves,boardPorts,handPairs,tileKey,DEFAULTS,totalScore} from '../site/engine.js';

function stagedFinal(){
  const g=newGame({seed:20261030,startingPlayer:0});
  const id=k=>g.tiles.filter(t=>tileKey(t)===k).map(t=>t.id)[0];
  g.hands[0]=[id('6-6'),id('0-0'),id('2-5'),id('5-6'),id('1-4')];
  g.hands[1]=[id('0-5'),id('5-5'),id('2-3'),id('4-4'),id('1-2')];
  g.stock=[id('1-1')]; // exactly one draw remains, and this cannot make Supreme
  dispatch(g,{type:'open',ids:g.hands[0].slice(0,2)});
  assert.equal(g.current,1);
  dispatch(g,{type:'bidExchange',ids:[id('4-4')]});
  assert.equal(g.final,true);
  assert.equal(g.lastDrawBy,1);
  assert.equal(handPairs(g,1,true).length,0,'Supreme cannot be raised');
  return {g,id};
}
function put(g,id,pip,portKey=null){
  const moves=attachmentMoves(g,[id]);
  const m=moves.find(m=>portKey?m.portKey===portKey:m.placements[0].a===pip);
  assert.ok(m,'expected legal attachment');
  dispatch(g,{type:'attach',ids:[id],moveKey:m.key});
}
test('exhausted-stock raise pass starts alternating attachments rather than eliminating the passer',()=>{
  const {g,id}=stagedFinal();
  dispatch(g,{type:'passOpen'});
  assert.equal(g.phase,'attachment');
  assert.equal(g.current,1,'the declining bidder plays first');
  assert.equal(g.passStreak,0);
  put(g,id('0-5'),0,'root-right');
  assert.equal(g.current,0,'opponent must get the next turn');
  put(g,id('2-5'),5);
  assert.equal(g.current,1,'declining bidder must return to play');
  assert.equal(g.phase,'attachment');
  assert.equal(g.board.items.length,4); // two opening tiles and two attachments
  assert.equal(g.hands[1].includes(id('5-5')),true);
});
test('final attachment pass never eliminates a player, and a later attachment resets consecutive passes',()=>{
  const {g,id}=stagedFinal();
  dispatch(g,{type:'passOpen'});
  put(g,id('0-5'),0,'root-right');
  dispatch(g,{type:'passAttach'}); // P0 declines despite having an option.
  assert.equal(g.current,1);
  assert.equal(g.passStreak,1);
  put(g,id('5-5'),5);
  assert.equal(g.current,0,'previous passer can re-enter');
  assert.equal(g.passStreak,0);
  assert.equal(boardPorts(g.board).filter(x=>x.pip===5).length,3);
  put(g,id('2-5'),5);
  assert.equal(g.current,1);
  assert.equal(g.passStreak,0);
});
test('two consecutive final attachment passes settle scores, retain remaining penalty and last-draw penalty',()=>{
  const {g}=stagedFinal();
  dispatch(g,{type:'passOpen'});
  dispatch(g,{type:'passAttach'});
  assert.equal(g.current,0);
  assert.equal(g.phase,'attachment');
  assert.equal(g.passStreak,1);
  dispatch(g,{type:'passAttach'});
  assert.equal(g.phase,'finished');
  assert.equal(g.endReason,'exhaustion');
  assert.equal(g.scores[1].lastDraw,DEFAULTS.lastDrawPenalty);
  assert.ok(g.scores[0].remaining>0);
  assert.ok(g.scores[1].remaining>0);
  assert.ok(Number.isFinite(totalScore(g,0)));
});
test('last-stock draw on an attachment pass counts as first pass and offers opponent one move',()=>{
  const g=newGame({seed:18,startingPlayer:0});
  const ids=[...g.hands[0].slice(0,2)];
  dispatch(g,{type:'open',ids});
  dispatch(g,{type:'passOpen'});
  assert.equal(g.phase,'attachment');
  const passer=g.current;
  g.stock=g.stock.slice(0,1);
  dispatch(g,{type:'passAttach'});
  assert.equal(g.final,true);
  assert.equal(g.passStreak,1);
  assert.equal(g.current,1-passer);
  dispatch(g,{type:'passAttach'});
  assert.equal(g.phase,'finished');
});
test('empty final table permits passing only when fewer than two tiles remain',()=>{
  const g=newGame({seed:34,startingPlayer:0});
  g.final=true;g.stock=[];g.hands[0]=[g.hands[0][0]];
  g.hands[1]=[g.hands[1][0]];
  dispatch(g,{type:'passOpen'});
  assert.equal(g.phase,'opening');
  assert.equal(g.current,1);
  dispatch(g,{type:'passOpen'});
  assert.equal(g.phase,'finished');
  const h=newGame({seed:35,startingPlayer:0});
  h.final=true;h.stock=[];
  const snapshot=JSON.stringify(h);
  assert.throws(()=>dispatch(h,{type:'passOpen'}),/最初の役/);
  assert.equal(JSON.stringify(h),snapshot);
});
test('final opening after one unable player passes can still be started by the other',()=>{
  const g=newGame({seed:32,startingPlayer:0});
  g.final=true;g.stock=[];g.hands[0]=[g.hands[0][0]];
  const start=[...g.hands[1].slice(0,2)];
  dispatch(g,{type:'passOpen'});
  dispatch(g,{type:'open',ids:start});
  assert.equal(g.passStreak,0);
  assert.equal(g.current,0);
  dispatch(g,{type:'passOpen'});
  assert.equal(g.phase,'attachment');
  assert.equal(g.current,0,'the unable opener gets first chance to attach');
});
test('going out after stock exhaustion still triggers early win, not exhaustion penalty',()=>{
  const g=newGame({seed:81,initialHand:2,startingPlayer:0});
  g.stock=g.stock.slice(0,1);
  dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]});
  dispatch(g,{type:'open',ids:[...g.hands[0]]});
  assert.equal(g.phase,'finished');
  assert.equal(g.endReason,'early');
  assert.equal(g.scores[0].lastDraw,0);
  assert.equal(g.scores[0].early,DEFAULTS.earlyBonus);
});
