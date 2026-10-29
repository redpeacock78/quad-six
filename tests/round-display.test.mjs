import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../site/engine.js';
import * as ai from '../site/ai.js';
import * as matchLib from '../site/match.js';

async function makeUI(match) {
  const source = (await readFile(new URL('../site/ui.js', import.meta.url),'utf8'))
    .replace(/^import\s+[^\n]+\n/gm,'');
  const app={innerHTML:'',addEventListener(){}};
  const deps={...engine,...ai,...matchLib};
  const names='newGame dispatch roleOf isStronger attachmentMoves boardPorts getTile tilePips totalScore MARTIAL DEFAULTS chooseAIAction MATCH_FORMATS STARTING_POINTS createMatch settleMatchGame nextMatchGame matchWinner matchRoundName'.split(' ');
  const factory=new Function('deps','document','window',
    'const {'+names.join(',')+'}=deps;\n'+source+
    '\nreturn {mount(m){match=m;game=m.game;handoff=false;render()},refresh(){render()}};');
  const ui=factory(deps,{getElementById:()=>app},{confirm:()=>true,scrollTo(){}});
  ui.mount(match);
  return {app,ui};
}

function endGame(match, winner=null) {
  match.game.phase='finished';
  match.game.endReason=winner===null?'exhaustion':'early';
  match.game.endWinner=winner;
  matchLib.settleMatchGame(match);
}

test('tonpu round label stays the same through dealer renchan',async()=>{
  const m=matchLib.createMatch({format:'tonpu',mode:'local',seed:3,startingPlayer:0});
  const {app,ui}=await makeUI(m);
  assert.match(app.innerHTML,/東1局 0本場/);
  assert.match(app.innerHTML,/第1平場/);
  endGame(m,0);ui.refresh();
  assert.match(app.innerHTML,/東1局 0本場/);
  assert.match(app.innerHTML,/親連荘！/);
  matchLib.nextMatchGame(m,4);ui.mount(m);
  assert.match(app.innerHTML,/東1局 1本場/);
  endGame(m,1);ui.refresh();
  assert.match(app.innerHTML,/東1局 1本場/);
  matchLib.nextMatchGame(m,5);ui.mount(m);
  assert.match(app.innerHTML,/東2局 0本場/);
  assert.match(app.innerHTML,/東1局 1本場/); // history
});

test('hanchan score history and final recap show South round names',async()=>{
  const m=matchLib.createMatch({format:'hanchan',mode:'local',seed:9,startingPlayer:1});
  for(let i=0;i<4;i++) {
    endGame(m);
    matchLib.nextMatchGame(m,100+i);
  }
  const {app,ui}=await makeUI(m);
  assert.match(app.innerHTML,/南1局 0本場/);
  assert.match(app.innerHTML,/東4局 0本場/); // score history
  for(let i=0;i<4;i++){
    endGame(m);
    ui.refresh();
    assert.match(app.innerHTML,new RegExp('南'+(i+1)+'局 0本場'));
    if(i<3){matchLib.nextMatchGame(m,200+i);ui.mount(m)}
  }
  assert.equal(m.complete,true);
  assert.match(app.innerHTML,/南4局 0本場/);
  assert.match(app.innerHTML,/MATCH SET/);
  assert.match(app.innerHTML,/東1局 0本場/);
});

test('mobile match panel uses 東N局 M本場 for screenshot-like five-game history',async()=>{
  const m=matchLib.createMatch({format:'tonpu',mode:'local',seed:27,startingPlayer:0});
  endGame(m,0); // 東1局 0本場 -> repeat
  matchLib.nextMatchGame(m,30);
  endGame(m,1); // 東1局 1本場 -> 東2局
  matchLib.nextMatchGame(m,31);
  endGame(m,1); // 東2局 0本場 -> repeat
  matchLib.nextMatchGame(m,32);
  endGame(m,1); // 東2局 1本場 -> repeat
  matchLib.nextMatchGame(m,33);
  endGame(m,0); // 東2局 2本場 -> 東3局
  matchLib.nextMatchGame(m,34);
  assert.equal(m.gameNumber,6);
  assert.equal(m.handNumber,3);
  const {app}=await makeUI(m);
  assert.match(app.innerHTML,/<h3 class="match-round-name">東3局 0本場<\/h3>/);
  assert.match(app.innerHTML,/東風戦 · 第6ゲーム/);
  assert.match(app.innerHTML,/<th>局<\/th>/);
  assert.match(app.innerHTML,/<strong>東1局 0本場<\/strong>/);
  assert.match(app.innerHTML,/<strong>東1局 1本場<\/strong>/);
  assert.match(app.innerHTML,/<strong>東2局 2本場<\/strong>/);
  assert.doesNotMatch(app.innerHTML,/3\/4親番/);
});
