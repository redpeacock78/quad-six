import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../site/engine.js';
import * as ai from '../site/ai.js';
import * as matchLib from '../site/match.js';

// Load the actual browser module in a tiny in-memory DOM to inspect rendered HTML.
// This is a test-only evaluation, not part of the browser bundle.
async function makeUI() {
  const source = (await readFile(new URL('../site/ui.js', import.meta.url), 'utf8'))
    .replace(/^import\s+[^\n]+\n/gm, '');
  const app = {
    innerHTML: '', listener:null,
    addEventListener(type, callback) { if (type === 'click') this.listener=callback; }
  };
  const document = { getElementById: id=>id==='app'?app:null };
  const window = { confirm:()=>true };
  const deps = { ...engine, ...ai, ...matchLib };
  const imported = 'newGame dispatch roleOf isStronger attachmentMoves getTile tilePips totalScore MARTIAL DEFAULTS chooseAIAction MATCH_FORMATS STARTING_POINTS createMatch settleMatchGame nextMatchGame matchWinner'.split(' ');
  const factory = new Function('deps','document','window',
    'const {'+imported.join(',')+'} = deps;\n'+source+
    '\nreturn { mount(m) { match=m;game=m.game;handoff=false;render(); }, refresh() {render();} };');
  const ui = factory(deps,document,window);
  return {
    app, ...ui,
    click(action) { assert.ok(app.listener); app.listener({target:{closest:()=>({dataset:{action}})}}); }
  };
}

function finishedMatch({ mode='cpu', opponentCount=4 }={}) {
  const match = matchLib.createMatch({format:'hanchan',mode,seed:42});
  match.game.current=mode==='cpu'?1:0;
  match.game.hands[mode==='cpu'?1:1] = match.game.hands[1].slice(0,opponentCount);
  match.game.board={
    items:[{id:23,a:2,b:3},{id:24,a:3,b:1}],splitIndex:1
  };
  match.game.openingRole={name:'雑'};
  match.game.phase='finished';
  match.game.endReason='early';
  matchLib.settleMatchGame(match);
  return match;
}

test('opponent backs reflect actual hidden hand count during play', async () => {
  const ui=await makeUI();
  const m=matchLib.createMatch({mode:'cpu',seed:6});
  ui.mount(m);
  assert.match(ui.app.innerHTML,/CPUの手牌は9枚/);
  assert.equal((ui.app.innerHTML.match(/domino small face-down no-select/g)||[]).length,9);
  assert.match(ui.app.innerHTML,/あなたの手札 9枚/);
  m.game.current=1;
  m.game.hands[1].pop();
  ui.refresh();
  assert.match(ui.app.innerHTML,/CPUの手牌は8枚/);
  assert.equal((ui.app.innerHTML.match(/domino small face-down no-select/g)||[]).length,8);
  assert.match(ui.app.innerHTML,/あなたの手札 9枚/);
  assert.doesNotMatch(ui.app.innerHTML,/CPUの手札 8枚/);
});

test('finished match toggles from score overlay to final table and back without changing scores', async () => {
  const ui=await makeUI();
  const m=finishedMatch({opponentCount:4});
  const savedPoints=[...m.points];
  ui.mount(m);
  assert.match(ui.app.innerHTML,/終局時の盤面を見る/);
  assert.match(ui.app.innerHTML,/class="overlay"/);
  ui.click('inspect-board');
  assert.doesNotMatch(ui.app.innerHTML,/class="overlay"/);
  assert.match(ui.app.innerHTML,/終局時の盤面を確認中/);
  assert.match(ui.app.innerHTML,/CPUの手牌は4枚/);
  assert.equal((ui.app.innerHTML.match(/domino small face-down no-select/g)||[]).length,4);
  assert.match(ui.app.innerHTML,/あなたの残り手札 9枚/);
  assert.match(ui.app.innerHTML,/左端 <b>2<\/b>/);
  assert.match(ui.app.innerHTML,/右端 <b>1<\/b>/);
  assert.match(ui.app.innerHTML,/精算結果に戻る/);
  assert.doesNotMatch(ui.app.innerHTML,/data-action="open"/);
  ui.click('back-to-result');
  assert.match(ui.app.innerHTML,/GAME SET · SCORE SETTLEMENT/);
  assert.match(ui.app.innerHTML,/終局時の盤面を見る/);
  assert.deepEqual(m.points,savedPoints);
  assert.equal(m.history.length,1);
});

test('opponent hand is concealed in two-player local game', async () => {
  const ui=await makeUI();
  const m=matchLib.createMatch({mode:'local',seed:8});
  ui.mount(m);
  assert.match(ui.app.innerHTML,/プレイヤー2の手牌は9枚/);
  assert.equal((ui.app.innerHTML.match(/domino small face-down no-select/g)||[]).length,9);
  assert.match(ui.app.innerHTML,/プレイヤー1の手札 9枚/);
  m.game.current=1;ui.refresh();
  assert.match(ui.app.innerHTML,/プレイヤー1の手牌は9枚/);
  assert.match(ui.app.innerHTML,/プレイヤー2の手札 9枚/);
});
