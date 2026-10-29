import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../site/engine.js';
import * as ai from '../site/ai.js';
import * as matchLib from '../site/match.js';

test('CPU plays the opening bid automatically when drawn as the first parent', async () => {
  const source = (await readFile(new URL('../site/ui.js', import.meta.url), 'utf8'))
    .replace(/^import\s+[^\n]+\n/gm,'');
  const app={innerHTML:'',listener:null,
    addEventListener(name,fn){if(name==='click')this.listener=fn;}
  };
  const queue=[];
  const timers=(fn)=>{queue.push(fn);return queue.length;};
  const deps={...engine,...ai,...matchLib};
  const names='newGame dispatch roleOf isStronger attachmentMoves boardPorts getTile tilePips totalScore MARTIAL DEFAULTS chooseAIAction MATCH_FORMATS STARTING_POINTS createMatch settleMatchGame nextMatchGame matchWinner matchRoundName'.split(' ');
  const factory=new Function('deps','document','window','setTimeout','clearTimeout',
    'const {'+names.join(',')+'}=deps;\n'+source+
    '\nreturn {start, getState:()=>({game,match})};');
  const ui=factory(deps,{getElementById:id=>id==='app'?app:null},
    {confirm:()=>true,scrollTo(){}},timers,()=>{});
  const originalRandom=Math.random;
  try {
    Math.random=()=>0.99;
    ui.start('cpu','tonpu');
  } finally {
    Math.random=originalRandom;
  }
  assert.equal(ui.getState().match.initialStarter,1);
  assert.equal(ui.getState().game.current,1);
  assert.match(app.innerHTML,/CPUの番/);
  assert.equal(queue.length,1,'CPU first move must be scheduled');
  queue.shift()();
  assert.equal(ui.getState().game.current,0,'after CPU opens it should become human turn');
  assert.ok(ui.getState().game.scores[1].role>=5,'CPU has scored an opening role');
  assert.equal(ui.getState().game.hands[1].length,7);
  assert.match(app.innerHTML,/あなたの番/);
});

test('second game alternates the first parent after CPU starts', () => {
  const m=matchLib.createMatch({format:'tonpu',startingPlayer:1,seed:21});
  assert.equal(m.initialStarter,1);
  m.game.phase='finished'; m.game.endReason='early'; m.game.endWinner=0;
  matchLib.settleMatchGame(m);
  matchLib.nextMatchGame(m,22);
  assert.equal(m.game.current,0);
  assert.equal(m.game.lead,0);
});
