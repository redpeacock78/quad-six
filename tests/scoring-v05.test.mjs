import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dispatch, tileKey, totalScore, DEFAULTS } from '../site/engine.js';
import { createMatch, settleMatchGame, nextMatchGame } from '../site/match.js';

test('an actual last-tile opening records the player who went out', () => {
  const game=newGame({seed:81,initialHand:2,startingPlayer:1});
  const ids=[...game.hands[1]];
  dispatch(game,{type:'open',ids,flips:[false,false]});
  assert.equal(game.phase,'finished');
  assert.equal(game.endReason,'early');
  assert.equal(game.endWinner,1);
  assert.equal(game.scores[1].early,15);
  assert.equal(game.scores[0].tableHonba,0);
  assert.equal(game.scores[1].tableHonba,0);
});

test('an opening overwrite raises by 3 points, never by table-honba points', () => {
  const game=newGame({seed:42,initialHand:4,startingPlayer:0});
  const ids=key=>game.tiles.filter(t=>tileKey(t)===key).map(t=>t.id);
  game.hands[0]=[ids('0-1')[0],ids('0-2')[0],ids('1-4')[0],ids('3-4')[0]];
  game.hands[1]=[ids('6-6')[0],ids('6-6')[1],ids('1-5')[0],ids('2-5')[0]];
  game.stock=game.tiles.map(t=>t.id).filter(id=>!game.hands[0].includes(id)&&!game.hands[1].includes(id));
  dispatch(game,{type:'open',ids:game.hands[0].slice(0,2)});
  assert.equal(game.openingRole.tier,'common');
  dispatch(game,{type:'open',ids:game.hands[1].slice(0,2)});
  assert.equal(game.openingRole.tier,'civil');
  assert.equal(game.raise,1);
  dispatch(game,{type:'passOpen'});
  assert.equal(game.phase,'attachment');
  assert.equal(game.scores[0].raise,0);
  assert.equal(game.scores[1].raise,DEFAULTS.raiseUnit);
  assert.equal(DEFAULTS.raiseUnit,3);
  assert.equal(game.scores[1].tableHonba,0);
  assert.equal(totalScore(game,1),game.scores[1].role+game.scores[1].pips+3);
});

test('real early finish from the engine can trigger a dealer continuation', () => {
  const match=createMatch({format:'tonpu',initialHand:2,startingPlayer:0,seed:9});
  dispatch(match.game,{type:'open',ids:[...match.game.hands[0]]});
  assert.equal(match.game.endWinner,0);
  const record=settleMatchGame(match);
  assert.equal(record.renchan,true);
  assert.equal(record.honbaPoints,0);
  assert.equal(match.honba,1);
  nextMatchGame(match,19);
  assert.equal(match.game.lead,0);
});
