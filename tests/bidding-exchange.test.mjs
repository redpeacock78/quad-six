import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,dispatch,roleOf,boardPorts,tileKey} from '../site/engine.js';

function fixture(){
  const game=newGame({seed:20261030,startingPlayer:0});
  game.current=0;
  return game;
}

test('bid exchange can replace every tile, then bid on the SAME turn',()=>{
  const g=fixture(),initial=[...g.hands[0]],stock=g.stock.length;
  dispatch(g,{type:'bidExchange',ids:initial});
  assert.equal(g.phase,'opening');
  assert.equal(g.current,0);
  assert.equal(g.hands[0].length,initial.length);
  assert.equal(g.stock.length,stock-initial.length);
  assert.deepEqual(g.discard,initial);
  assert.equal(g.bidExchanged[0],true);
  assert.ok(g.hands[0].every(id=>!initial.includes(id)));
  const bid=g.hands[0].slice(0,2);
  dispatch(g,{type:'open',ids:bid});
  assert.equal(g.phase,'opening');
  assert.ok(g.board);
  assert.equal(g.openingRole.name,roleOf(g,bid).name);
  assert.equal(g.current,1);
});

test('exchange permission is per player, once per bidding round',()=>{
  const g=fixture();
  dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]});
  const snapshot=JSON.stringify(g);
  assert.throws(()=>dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]}),/すでに/);
  assert.equal(JSON.stringify(g),snapshot);
  g.current=1;
  dispatch(g,{type:'bidExchange',ids:[g.hands[1][0]]});
  assert.deepEqual(g.bidExchanged,[true,true]);
  assert.equal(g.current,1);
});

test('invalid bid exchanges never mutate stock, discard or hand',()=>{
  for(const ids of [[],[0,0],[999],'invalid']){
    const g=fixture(),snap=JSON.stringify(g);
    assert.throws(()=>dispatch(g,{type:'bidExchange',ids}));
    assert.equal(JSON.stringify(g),snap);
  }
  const g=fixture(),snap=JSON.stringify(g);
  g.stock=g.stock.slice(0,1);
  const short=JSON.stringify(g);
  assert.throws(()=>dispatch(g,{type:'bidExchange',ids:g.hands[0].slice(0,2)}),/山札は残り1枚/);
  assert.equal(JSON.stringify(g),short);
  g.phase='adjustment';
  const phaseSnap=JSON.stringify(g);
  assert.throws(()=>dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]}),/競り中ではありません/);
  assert.equal(JSON.stringify(g),phaseSnap);
});

test('bid exchange at the last stock tile enters final opening without skipping bidding',()=>{
  const g=fixture();
  g.stock=g.stock.slice(0,1);
  dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]});
  assert.equal(g.final,true);
  assert.equal(g.phase,'opening');
  assert.equal(g.current,0);
  assert.equal(g.stock.length,0);
  assert.equal(g.bidExchanged[0],true);
  assert.equal(g.lastDrawBy,0);
  const before=JSON.stringify(g);
  assert.throws(()=>dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]}));
  assert.equal(JSON.stringify(g),before);
  assert.doesNotThrow(()=>dispatch(g,{type:'open',ids:g.hands[0].slice(0,2)}));
});

test('new bidding round restores exchanges for BOTH players',()=>{
  const g=fixture();
  dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]});
  dispatch(g,{type:'open',ids:g.hands[0].slice(0,2)});
  dispatch(g,{type:'passOpen'}); // second player
  // Force both players to pass their attachments to finish the mini-round.
  dispatch(g,{type:'passAttach'});
  dispatch(g,{type:'passAttach'});
  assert.equal(g.phase,'adjustment');
  assert.deepEqual(g.bidExchanged,[true,false]);
  dispatch(g,{type:'adjust',choice:'draw'});
  dispatch(g,{type:'adjust',choice:'draw'});
  assert.equal(g.phase,'opening');
  assert.deepEqual(g.bidExchanged,[false,false]);
});

test('mandatory inter-round adjustment cannot be skipped',()=>{
  const g=fixture();g.phase='adjustment';
  const previous=JSON.stringify(g);
  assert.throws(()=>dispatch(g,{type:'adjust',choice:'none'}),/1枚ドローか交換/);
  assert.equal(JSON.stringify(g),previous);
  dispatch(g,{type:'adjust',choice:'draw'});
  assert.equal(g.adjustDone[0],true);
});

test('Supreme opening and two-root exception survive exchange before opening',()=>{
  const g=fixture();
  const id=k=>g.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
  g.hands[0]=g.tiles.map(t=>t.id).filter(x=>x!==id('6-6')[0]&&x!==id('0-0')[0]);
  g.hands[0].push(id('6-6')[0],id('0-0')[0]);
  const throwAway=g.hands[0].find(x=>x!==id('6-6')[0]&&x!==id('0-0')[0]);
  dispatch(g,{type:'bidExchange',ids:[throwAway]});
  dispatch(g,{type:'open',ids:[id('6-6')[0],id('0-0')[0]]});
  assert.equal(g.openingRole.tier,'supreme');
  assert.equal(g.board.chosenSide,'supreme');
  assert.equal(boardPorts(g.board).length,2);
});

test('stock exhaustion during compulsory adjustment starts a fresh final auction',()=>{
  const g=fixture();
  dispatch(g,{type:'bidExchange',ids:[g.hands[0][0]]});
  dispatch(g,{type:'open',ids:g.hands[0].slice(0,2)});
  dispatch(g,{type:'passOpen'});
  dispatch(g,{type:'passAttach'});
  dispatch(g,{type:'passAttach'});
  assert.equal(g.phase,'adjustment');
  assert.deepEqual(g.bidExchanged,[false,false],
    'end of previous table must release bidding rights before drawing');
  g.stock=g.stock.slice(0,1);
  dispatch(g,{type:'adjust',choice:'draw'});
  assert.equal(g.final,true);
  assert.equal(g.phase,'opening');
  assert.deepEqual(g.bidExchanged,[false,false],
    'the final bidding round must not inherit stale exchange permissions');
  assert.equal(g.lastDrawExempt,false);
});
