import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../site/engine.js';
import * as ai from '../site/ai.js';
import * as matchLib from '../site/match.js';

async function mountUI() {
  const source = (await readFile(new URL('../site/ui.js', import.meta.url), 'utf8'))
    .replace(/^import\s+[^\n]+\n/gm, '');
  const app = { innerHTML:'', listener:null,
    addEventListener(type,cb) { if(type==='click') this.listener=cb; }
  };
  let confirmExit = false;
  const mockWindow={ confirm:()=>confirmExit, scrollTo(){} };
  const deps={...engine,...ai,...matchLib};
  const names = 'newGame dispatch roleOf isStronger attachmentMoves getTile tilePips totalScore MARTIAL DEFAULTS chooseAIAction MATCH_FORMATS STARTING_POINTS createMatch settleMatchGame nextMatchGame matchWinner matchRoundName'.split(' ');
  const factory = new Function('deps','document','window',
    'const {'+names.join(',')+'}=deps;\n'+source+`
return {
  state(){return {game,match,helpOpen,inspectFinalBoard,handoff};},
  endGame(){game.phase='finished';game.endReason='early';game.endWinner=0;settleIfFinished();render();}
};`);
  const ui = factory(deps,{getElementById:id=>id==='app'?app:null},mockWindow);
  return {
    app, ...ui,
    allowExit(value){confirmExit=value;},
    click(action,inside=false) {
      const element={dataset:{action},closest(){return this;}};
      const target=inside?{closest(){return element;}}:element;
      app.listener({target});
    }
  };
}

test('GitHub links and clickable title are accessible on the home page',async()=>{
  const ui=await mountUI();
  assert.match(ui.app.innerHTML,/data-action="go-home"/);
  assert.match(ui.app.innerHTML,/aria-label="賽棋 Quad6 — タイトル画面へ戻る"/);
  assert.equal((ui.app.innerHTML.match(/href="https:\/\/github.com\/redpeacock78\/quad-six"/g)||[]).length,2);
  assert.match(ui.app.innerHTML,/target="_blank" rel="noopener noreferrer"/);
  ui.click('go-home');
  assert.equal(ui.state().game,null);
});

test('clicking the logo confirms before abandoning an active match',async()=>{
  const ui=await mountUI();
  ui.click('start-cpu');
  assert.ok(ui.state().game);
  ui.click('go-home');
  assert.ok(ui.state().game,'cancel should preserve the current match');
  ui.allowExit(true);
  ui.click('go-home');
  assert.equal(ui.state().game,null);
  assert.equal(ui.state().match,null);
  assert.match(ui.app.innerHTML,/CPUと対戦する/);
});

test('help and role explanations close only on a direct backdrop click',async()=>{
  const ui=await mountUI();
  ui.click('help');
  assert.equal(ui.state().helpOpen,true);
  assert.match(ui.app.innerHTML,/武牌9種の役表/);
  assert.match(ui.app.innerHTML,/data-action="dismiss-help"/);
  ui.click('dismiss-help',true); // Inside the dialog
  assert.equal(ui.state().helpOpen,true);
  ui.click('dismiss-help'); // Directly on the backdrop
  assert.equal(ui.state().helpOpen,false);
  ui.click('help');
  ui.click('close-help');
  assert.equal(ui.state().helpOpen,false);
});

test('result backdrop shows the final board; handoff modal does not dismiss',async()=>{
  const ui=await mountUI();
  ui.click('start-cpu');
  ui.endGame();
  assert.match(ui.app.innerHTML,/data-action="dismiss-results"/);
  ui.click('dismiss-results',true);
  assert.equal(ui.state().inspectFinalBoard,false);
  ui.click('dismiss-results');
  assert.equal(ui.state().inspectFinalBoard,true);
  assert.match(ui.app.innerHTML,/終局時の盤面を確認中/);
  ui.click('back-to-result');
  assert.equal(ui.state().inspectFinalBoard,false);
  ui.click('back-home');
  ui.click('start-local');
  assert.equal(ui.state().handoff,true);
  assert.doesNotMatch(ui.app.innerHTML,/data-action="dismiss-handoff"/);
  assert.match(ui.app.innerHTML,/PASS THE DEVICE/);
});
