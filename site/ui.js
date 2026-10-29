import { newGame, dispatch, roleOf, isStronger, attachmentMoves, getTile, tilePips, totalScore, MARTIAL, DEFAULTS } from './engine.js';
import { chooseAIAction } from './ai.js';
import { MATCH_FORMATS, STARTING_POINTS, createMatch, settleMatchGame, nextMatchGame, matchWinner } from './match.js';


const $app = document.getElementById('app');
let game = null;
let match = null;
let selectedFormat = 'single';
let cpuTimer = null;
let selected = [];
let flipped = {};
let helpOpen = false;
let handoff = false;
let busy = false;
let toastMessage = '';
let toastTimer = null;
const MODE_LABELS = { cpu: ['あなた', 'CPU'], local: ['プレイヤー1', 'プレイヤー2'] };
const PIPS = {
  0: [], 1: [[2,2]], 2: [[1,1],[3,3]], 3: [[1,1],[2,2],[3,3]],
  4: [[1,1],[3,1],[1,3],[3,3]], 5: [[1,1],[3,1],[2,2],[1,3],[3,3]],
  6: [[1,1],[1,2],[1,3],[3,1],[3,2],[3,3]]
};
const safe = (v) => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const nameOf = (p) => MODE_LABELS[game?.mode || 'cpu'][p];
const endsOf = () => game?.board ? [game.board.items[0].a, game.board.items[game.board.items.length - 1].b] : null;
const isHumanTurn = () => game && (game.mode === 'local' || game.current === 0);

function pipHalf(n) {
  return `<span class="half">${PIPS[n].map(([x,y]) => `<span class="pip" style="left:${x*25}%;top:${y*25}%"></span>`).join('')}</span>`;
}
function dominoMarkup(a, b, { small = false, large = false, back = false, selected = false, button = false, id = null } = {}) {
  const cls = `domino ${small?'small ':''}${large?'large ':''}${button?'hold ':''}${selected?'selected ':''}${back?'face-down ':''}no-select`;
  const middle = back ? '' : `${pipHalf(a)}${pipHalf(b)}`;
  return button ? `<button class="${cls}" data-action="select" data-id="${id}" title="${a}｜${b}を選択" aria-label="${a}｜${b}を選択" aria-pressed="${selected}">${middle}</button>` : `<div class="${cls}" role="img" aria-label="${back?'裏向きの牌':`${a}｜${b}`} ">${middle}</div>`;
}
function tileDisplay(id, { flip = false, ...opts } = {}) {
  const tile = getTile(game,id);
  return dominoMarkup(flip ? tile.b : tile.a, flip ? tile.a : tile.b, { ...opts, id });
}
function currentHand() {
  if (!game || (game.mode === 'cpu' && game.current === 1)) return '';
  return game.hands[game.current].map(id => {
    const tile = getTile(game, id);
    const flip = Boolean(flipped[id]);
    return `<div class="tile-wrap">${tileDisplay(id, { flip, button:true, selected:selected.includes(id) })}${game.phase==='opening' && tile.a !== tile.b ? `<button class="flip-control" data-action="flip" data-id="${id}" title="牌を反転">↻</button>` : ''}</div>`;
  }).join('');
}
function formatMove(move) {
  if (move.special) return '至尊・両側接続';
  return move.side === 'left' ? '左端' : '右端';
}
function movesMarkup() {
  const moves = attachmentMoves(game, selected);
  if (!moves.length) return `<div class="empty-action">${selected.length ? '選んだ牌は今の開放端に接続できないよ' : '1枚か2枚を選んで接続方法を確認しよう'}</div>`;
  return `<div class="move-options">${moves.map(move => `<button class="move-option" data-action="attach" data-key="${safe(move.key)}">${move.special?'✦ ':''}${formatMove(move)}へ${move.placements.length}枚<span>${move.placements.map(v=>`[${v.a}｜${v.b}]`).join(' → ')} · +${move.placements.reduce((n,v)=>n+v.a+v.b,0)}点</span></button>`).join('')}</div>`;
}
function actionPanel() {
  const isCPU = !isHumanTurn();
  if (isCPU) return `<div class="help-text">CPUが次の一手を考えているよ…</div>`;
  if (game.phase === 'opening') {
    const ready = selected.length === 2;
    const role = ready ? roleOf(game,selected) : null;
    const allowed = role && isStronger(role, game.openingRole);
    const pending = game.board ? 'より強い役で上書きするか、見送って付札へ' : '手札から2枚選んで最初の役を置こう';
    return `<div class="action-head"><strong>${game.board?'上書き勝負':'最初の役を出す'}</strong><span class="small-label">天九</span></div>
      <p class="help-text">${pending}${game.final?' · 最終局（パスで脱落）':''}</p>
      ${role ? `<div class="role-preview"><span>選択した役<br><strong>${safe(role.name)}</strong></span><span>役点 +${role.points} / ピップ +${selected.reduce((s,id)=>s+tilePips(getTile(game,id)),0)} ${!allowed?'<br>※ 上書き不可':''}</span></div>` : ''}
      <div class="action-buttons"><button class="button primary" data-action="open" ${!ready||!allowed?'disabled':''}>${game.board?'この役で上書き':'役を場に出す'} ↗</button>
      ${(game.board || game.final) ? `<button class="button quiet" data-action="passOpen">${game.final?'パスして脱落':'上書きを見送る'}</button>` : ''}
      ${selected.length?'<button class="button quiet" data-action="clear">選び直す</button>':''}</div>`;
  }
  if (game.phase === 'attachment') {
    return `<div class="action-head"><strong>付札を選ぼう</strong><span class="small-label">ドミノ</span></div>
      <p class="help-text">手札から1〜2枚選択して接続先を決めよう · 左右どちらにも伸ばせるよ${game.final?' · 最終局のパスは即脱落':''}</p>
      ${movesMarkup()}
      <div class="action-buttons"><button class="button quiet" data-action="passAttach">${game.final?'パスして脱落':'パス · 1枚引く'}</button>${selected.length?'<button class="button quiet" data-action="clear">選び直す</button>':''}</div>`;
  }
  if (game.phase === 'adjustment') {
    return `<div class="action-head"><strong>手札調整</strong><span class="small-label">交換 / 補充</span></div><p class="help-text">この局間で各プレイヤー1回だけ選べるよ · 交換牌は公開除外されるよ</p>
      <div class="action-buttons"><button class="button primary" data-action="adjust-draw">1枚ドロー</button><button class="button" data-action="adjust-exchange" ${selected.length!==1?'disabled':''}>${selected.length===1?'選んだ1枚を交換':'交換する牌を1枚選ぶ'}</button><button class="button quiet" data-action="adjust-none">何もしない</button></div>`;
  }
  return '';
}
function boardMarkup() {
  if (!game.board) return `<div class="board-empty"><div class="symbol">◇</div><strong>盤面はまだ空だよ</strong><small>平場で最初の役を置いて始めよう</small></div>`;
  const items = game.board.items, split = game.board.splitIndex;
  const leftItems = items.slice(0,split), rightItems=items.slice(split);
  const renderItems = (group) => group.map(v=>dominoMarkup(v.a,v.b)).join('');
  return `<div class="board-strip"><span class="edge-marker left" title="左の開放端">${items[0].a}</span><div class="board-group">${renderItems(leftItems)}</div><span class="root-joint" title="平場の2枚を繋ぐ中央の境界">✦</span><div class="board-group">${renderItems(rightItems)}</div><span class="edge-marker right" title="右の開放端">${items[items.length-1].b}</span></div>`;
}
function phaseLabel() {
  if (game.phase === 'opening') return '01 · 平場 / 上書き';
  if (game.phase === 'attachment') return '02 · 付札';
  if (game.phase === 'adjustment') return '03 · 手札調整';
  return '終局';
}
function scoreCard(p) {
  return `<div class="score-person ${game.current===p&&game.phase!=='finished'?'active':''}"><div><div class="player-name">${p===0?'◈':'◇'} ${nameOf(p)} ${game.finalOut[p]?'· 脱落':''}</div><div class="player-detail">手札 ${game.hands[p].length}枚 / 役 ${game.scores[p].role} / 付札等 ${game.scores[p].pips}</div></div><div class="points">${totalScore(game,p)}</div></div>`;
}
function matchPanel() {
  if (!match) return '';
  return `<section class="panel match-panel"><div class="side-section"><div class="side-title"><h3>${MATCH_FORMATS[match.format].label} · 第${match.gameNumber}/${match.totalGames}ゲーム</h3><span class="small-label">持ち点 ${STARTING_POINTS}点開始</span></div>
    <div class="match-points"><div><small>${nameOf(0)}</small><strong>${match.points[0]}</strong></div><div><small>${nameOf(1)}</small><strong>${match.points[1]}</strong></div></div>
    <p class="footnote">ゲーム終了時に得点差を移動 · 現在のゲームの得点は下の得点ボードに表示</p>
    ${match.history.length?`<details class="drawer"><summary>対局履歴（${match.history.length}ゲーム）</summary><table class="ledger"><thead><tr><th>ゲーム</th><th>得点差</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr></thead><tbody>${match.history.map(r=>`<tr><td>${r.game}</td><td>${r.delta>0?'+':''}${r.delta}</td><td>${r.points[0]}</td><td>${r.points[1]}</td></tr>`).join('')}</tbody></table></details>`:''}</div></section>`;
}
function sideMarkup() {
  const rows = game.rounds.map(r => `<tr><td>第${r.round}局</td><td>${r.role[0]+r.pips[0]+r.honba[0]}</td><td>${r.role[1]+r.pips[1]+r.honba[1]}</td></tr>`).join('');
  const closed = game.discard.slice(-10).reverse();
  return `<aside class="side-column">${matchPanel()}
  <section class="panel"><div class="side-section"><div class="side-title"><h3>得点ボード</h3><span class="small-label">SCORE</span></div>${scoreCard(0)}${scoreCard(1)}<div class="round-lbl">※ 終局時にボーナス・残牌点を精算するよ</div></div>
  <div class="side-section"><div class="side-title"><h3>進行状況</h3></div><div class="side-stats"><div class="statbox"><div class="number">${game.stock.length}</div><div class="label">山札</div></div><div class="statbox"><div class="number">${game.discard.length}</div><div class="label">公開除外</div></div><div class="statbox"><div class="number">${game.honba}</div><div class="label">本場</div></div></div>
  <details class="drawer"><summary>局別スコアと内訳を表示</summary><table class="ledger"><thead><tr><th>局</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr></thead><tbody>${rows}<tr class="total"><td>累計</td><td>${totalScore(game,0)}</td><td>${totalScore(game,1)}</td></tr></tbody></table><p class="footnote">本場は最終上書き者が総取り · 調整中の得点は含まれないよ</p></details>
  </div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>役の早見表</h3><span class="small-label">RANKS</span></div><div class="mini-role-list"><div class="mini-role"><span>✦ 至尊</span><b>20点</b></div><div class="mini-role"><span>Ⅱ 文牌 · 同じ牌2枚</span><b>15点</b></div><div class="mini-role"><span>Ⅲ 武牌 · 指定9組</span><b>10点</b></div><div class="mini-role"><span>Ⅳ 雑 · その他</span><b>5点</b></div></div><button class="button quiet tight full" style="margin-top:14px" data-action="help">武牌9種を見る →</button></div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>公開除外</h3><span class="small-label">DISCARD</span></div><div class="discards ${closed.length?'':'empty'}">${closed.length ? closed.map(id=>tileDisplay(id,{small:true})).join('') : 'まだ除外された牌はないよ'}</div>${game.discard.length>10?`<details class="drawer"><summary>すべての除外牌（${game.discard.length}枚）</summary><div class="discards" style="margin:10px 0">${game.discard.map(id=>tileDisplay(id,{small:true})).join('')}</div></details>`:''}</div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>対局ログ</h3></div>${game.history.slice(0,8).map(l=>`<div class="log-entry"><small>${l.round}局</small>${safe(l.text)}</div>`).join('')}</div></section>
  </aside>`;
}
function gameMarkup() {
  const current=game.current, human=isHumanTurn(), show=human&&!handoff;
  const hand = show?`<div class="hand-strip">${currentHand() || '<div class="empty-action">手札がないよ</div>'}</div>`:`<div class="hand-privacy">${game.mode==='cpu'?'CPUの手札は非公開': '次のプレイヤーが手札を確認するまで非公開'}</div>`;
  const ends=endsOf();
  return `<section class="game-layout"><div class="main-column">
    <div class="panel panel-pad statusbar"><div class="statusbar-left"><span class="pill ${game.final?'final-tag':''}">${game.final?'FINAL ROUND':`ROUND ${String(game.round).padStart(2,'0')}`}</span><div class="phase-label">${phaseLabel()}</div><span class="minor">${game.final?'山札なし・パスで脱落':'交互手番制'}</span></div><div class="turn-indicator"><i class="turn-dot ${current===1?'cpu':''}"></i>${nameOf(current)}の番</div></div>
    <section class="playmat"><div class="mat-heading"><div><span class="eyebrow">THE TABLE</span><h2>${game.openingRole?`平場役 · ${safe(game.openingRole.name)}`:'最初の役を待っています'}</h2></div><div class="mat-side-info">${game.board?`${game.board.items.length}枚が場にある`:'役は2枚で出す'}<br>${game.final?'最終出牌':'役は天九 · 接続はドミノ'}</div></div><div class="board-holder" id="board-holder">${boardMarkup()}</div><div class="mat-footer"><span>左端 <b>${ends?ends[0]:'—'}</b></span><span>通常の付札は同じ数字に接続</span><span>右端 <b>${ends?ends[1]:'—'}</b></span></div></section>
    <section class="panel hand-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR HAND</span><h2>${human?nameOf(current):'CPU'}の手札 ${game.hands[current].length}枚</h2></div><span class="pill">選択 ${selected.length} / 2</span></div>${hand}<div class="action-area">${show?actionPanel():`<div class="help-text">${handoff?'端末を次のプレイヤーへ渡してね':'CPUが考えています…'}</div>`}</div></section>
   </div>${sideMarkup()}</section>`;
}
function headerMarkup() {
  return `<header class="masthead"><div class="brand"><div class="brand-symbol">賽</div><div><div class="brand-text">賽棋 <span style="font-size:13px;color:var(--gold);letter-spacing:.05em">QUAD6</span></div><div class="brand-sub">THE DOMINO STRATEGY GAME</div></div></div><div class="header-actions">${game?`<span class="pill">${MATCH_FORMATS[match.format].label} · ${game.mode==='cpu'?'VS CPU':'LOCAL 2P'}</span>`:''}<button class="button quiet tight" data-action="help">ルール</button>${game?'<button class="button tight" data-action="restart">新しい対局</button>':''}</div></header>`;
}
function introDomino(a,b,extra='') { return `<div class="intro-domino" ${extra}>${dominoMarkup(a,b,{large:true})}</div>`; }
function homeMarkup(){
  return `<main class="intro"><div class="intro-copy"><span class="eyebrow">A GAME OF FIFTY-SIX TILES</span><h1>二人で競う。<br><em>五十六の選択。</em></h1><p class="lead">天九の「役」と、ドミノの「接続」。<br>上書きで競り、牌を繋ぎ、山の行方を読む。<br>道具は56枚のドミノと紙と鉛筆だけ。<br>古くて新しい、2人用の知略ゲーム。</p><div class="format-picker" role="group" aria-label="対局形式"><span class="eyebrow">対局形式を選択</span><div class="format-buttons">${Object.entries(MATCH_FORMATS).map(([id, f])=>`<button class="button format-choice ${selectedFormat===id?'chosen':''}" data-action="select-format" data-format="${id}" aria-pressed="${selectedFormat===id}">${f.label}<small>${f.games}ゲーム</small></button>`).join('')}</div><p class="help-text">初期持ち点は各250点 · 各ゲームの得点差を移動 · 先手はゲームごとに交代</p></div><div class="intro-actions"><button class="button primary large" data-action="start-cpu">CPUと対戦する →</button><button class="button large" data-action="start-local">同じ端末で2人対戦</button></div><div class="intro-feature"><div><b>56</b>DOMINO TILES</div><div><b>9</b>STARTING HAND</div><div><b>2</b>PLAYERS</div><div><b>0</b>INSTALL REQUIRED</div></div></div><div class="intro-visual"><div class="intro-mandala"></div>${introDomino(6,6)}${introDomino(0,0)}${introDomino(5,3)}${introDomino(2,4)}<div class="intro-title"><div class="kanji">賽棋</div><div class="roman">QUAD6</div><div class="intro-foot">A WAR OF WITS</div></div></div></main>`;
}
function helpMarkup() {
  const examples = MARTIAL.map(([name, a, b]) => `<tr><td>${name}</td><td>[${a.split('-').join('｜')}] + [${b.split('-').join('｜')}]</td></tr>`).join('');
  return `<div class="overlay" role="presentation"><div class="modal" role="dialog" aria-modal="true" aria-label="ルールブック"><span class="eyebrow">HOW TO PLAY · VER 0.3</span><h2>賽棋のあそびかた</h2><p>2人に9枚ずつ配ってスタート · 役を作って場に出し、その後は数字を繋ぐ · 手札をなくすか山札が尽きたら精算するよ</p>
  <h3>対局形式と持ち点</h3><p>一局戦＝1ゲーム、東風戦＝4ゲーム、半荘戦＝8ゲーム。各250点から開始し、各ゲーム終了時に（自分の得点－相手の得点）の差を持ち点として移動するよ。ゲームごとに56枚を混ぜ直し、先手を交代するよ。全ゲーム終了後の持ち点が高い方の勝ち。飛び終了はなしだよ。</p>
  <h3>① 平場：天九</h3><p>先攻が2枚で役を出し、相手はより強い役で上書きできるよ · 上書きされた牌は公開除外されるけど、得点は残る · 上書きが終わったら最後の役を起点に付札へ進むよ · 本場は最後の上書き者が総取りだよ</p>
  <table class="mini-table"><tr><th>階級</th><th>役</th><th>役点</th></tr><tr><td>最高</td><td>至尊 [6｜6] + [0｜0]</td><td>20</td></tr><tr><td>上</td><td>文牌：同じ牌2枚</td><td>15</td></tr><tr><td>中</td><td>武牌：次の指定9組</td><td>10</td></tr><tr><td>下</td><td>雑：その他の2枚</td><td>5</td></tr></table>
  <h3>武牌9種の役表</h3><table class="mini-table"><tr><th>役</th><th>2枚組</th></tr>${examples}</table>
  <p class="footnote">文牌は原則ピップ合計で比較するよ · ただし [0｜0] の対子だけは [6｜6] の対子に勝つ特例があるよ · 雑同士の上書きは不可としているよ</p>
  <h3>② 付札：ドミノ</h3><p>1手で1枚か2枚を選んで、盤面の左右の開放端に同じ数字を繋ぐよ · 2枚なら同じ方向へ連続接続するよ · ただし至尊の2枚だけは、開放端が0と6のときに両端へ同時に配置できるよ</p>
  <h3>③ パスと局の終了</h3><p>通常の付札でパスすると山札から1枚引くよ · 両者が連続パスしたら場の牌をすべて公開除外し、局と本場をリセットするよ · 局間はドロー / 1枚の公開交換 / 何もしない、から各自1回選べるよ</p>
  <h3>④ 終局と得点</h3><p>手札0枚なら早アガリで即終了、山札0枚なら最後の付札を続けて精算するよ · 最終付札中のパスは脱落になるよ</p>
  <table class="mini-table"><tr><th>項目</th><th>計算</th></tr><tr><td>役とピップ</td><td>出したときに加算</td></tr><tr><td>本場</td><td>最終上書き者に1本×3点</td></tr><tr><td>早アガリ</td><td>+15点</td></tr><tr><td>山を最後に引いた人</td><td>−15点（強制補充を除く）</td></tr><tr><td>残った手札</td><td>ピップ合計÷2、切り上げで減点</td></tr></table>
  <p class="footnote">実装上の暫定裁定：平場の2枚は中央に並べ、外側に見えている数字を左右の開放端にするよ · 平場の見送り側が最初の付札を行うよ · 雑同士の上書きは不可 · 付札の至尊には役点は追加しないよ · 先攻は局ごと交代するよ</p>
  <div class="modal-actions"><button class="button primary" data-action="close-help">盤面に戻る</button></div></div></div>`;
}
function endMarkup() {
  const scores = [totalScore(game,0),totalScore(game,1)];
  const record = match?.history.at(-1);
  const isComplete = Boolean(match?.complete);
  const winner = isComplete ? matchWinner(match) : record?.winner;
  const itemRows = ['role','pips','honba','early','lastDraw','remaining'];
  const labels = {role:'役点',pips:'ピップ点',honba:'本場点',early:'早アガリ',lastDraw:'山枯らし減点',remaining:'残牌減点'};
  return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true"><span class="eyebrow">${isComplete?'MATCH SET · FINAL STANDINGS':'GAME SET · SCORE SETTLEMENT'}</span><h2>${isComplete?(winner===null?'対局終了 · 引き分け！':`${nameOf(winner)}の総合勝利！`):`第${match.gameNumber}ゲーム終了`}</h2>
  <p>${game.endReason==='early'?'早アガリで終局':'山札が尽きて最終出牌終了'} · ${isComplete?`${MATCH_FORMATS[match.format].label}の全${match.totalGames}ゲーム終了`:`残り${match.totalGames-match.gameNumber}ゲーム`}</p>
  <div class="winner-row"><span class="win-number">${scores[0]} <span style="font-size:21px;color:#cbd7c9">—</span> ${scores[1]}</span></div>
  <table class="mini-table"><tr><th>このゲームの内訳</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr>${itemRows.map(k=>`<tr><td>${labels[k]}</td><td>${k==='lastDraw'||k==='remaining'?'-':''}${game.scores[0][k]}</td><td>${k==='lastDraw'||k==='remaining'?'-':''}${game.scores[1][k]}</td></tr>`).join('')}<tr><th>ゲーム得点</th><th>${scores[0]}</th><th>${scores[1]}</th></tr></table>
  <div class="settlement"><span>得点差 ${record?.delta>0?'+':''}${record?.delta??0}点 → 持ち点に反映</span><div class="match-points"><div><small>${nameOf(0)}</small><strong>${match.points[0]}</strong></div><div><small>${nameOf(1)}</small><strong>${match.points[1]}</strong></div></div></div>
  ${isComplete?`<h3>総合成績</h3><table class="mini-table"><tr><th>ゲーム</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th><th>得点差</th></tr>${match.history.map(r=>`<tr><td>${r.game}</td><td>${r.scores[0]}</td><td>${r.scores[1]}</td><td>${r.delta>0?'+':''}${r.delta}</td></tr>`).join('')}<tr><th>最終持ち点</th><th>${match.points[0]}</th><th>${match.points[1]}</th><th>合計500</th></tr></table>`:''}
  <div class="modal-actions">${isComplete?`<button class="button primary large" data-action="play-again">同じ形式でもう一戦！</button>`:`<button class="button primary large" data-action="next-game">次のゲームへ →</button>`}<button class="button quiet" data-action="back-home">タイトルへ</button></div></div></div>`;
}
function handoffMarkup() {
  return `<div class="overlay"><div class="modal privacy-view" role="dialog" aria-modal="true"><div class="symbol">◇</div><span class="eyebrow">PASS THE DEVICE</span><div class="title">${nameOf(game.current)}の番だよ</div><p>相手に手札が見えないよう端末を渡してね</p><div class="modal-actions" style="justify-content:center"><button class="button primary large" data-action="reveal">手札を確認して始める</button></div></div></div>`;
}
function render() {
  $app.innerHTML = `<div class="app-shell">${headerMarkup()}${game ? gameMarkup():homeMarkup()}<footer class="subfoot"><span>© Quad6 / 賽棋 · 2人用試遊版 · 無料 · インストール不要</span><span>天九の役 × ドミノの接続 × 累積得点</span></footer></div>${helpOpen?helpMarkup():''}${game&&game.phase==='finished'&&!helpOpen?endMarkup():''}${game&&handoff&&game.phase!=='finished'&&!helpOpen?handoffMarkup():''}${toastMessage?`<div class="toast" role="status">${safe(toastMessage)}</div>`:''}`;
}
function notify(message) {
  toastMessage = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMessage = ''; render(); }, 3100);
  render();
}
function resetTurnSelection() { selected = []; flipped = {}; }
function start(mode, format = selectedFormat) {
  clearTimeout(cpuTimer);
  const seed = Date.now() + Math.floor(Math.random()*100000);
  match = createMatch({ format, mode, initialHand:9, seed });
  game = match.game;
  selectedFormat = format;
  helpOpen = false;
  handoff = mode==='local';
  busy = false;
  resetTurnSelection();
  render();
}
function settleIfFinished() {
  if (match && game.phase === 'finished') settleMatchGame(match);
}
function advanceGame() {
  if (!match?.settled || match.complete) return;
  clearTimeout(cpuTimer);
  game = nextMatchGame(match, Date.now() + Math.floor(Math.random()*100000));
  resetTurnSelection();
  handoff = game.mode === 'local';
  busy = false;
  render();
  scheduleCPU();
}
function run(action) {
  if (!game) return;
  const prior = game.current;
  try { dispatch(game, action); }
  catch (e) { notify(e.message); return; }
  settleIfFinished();
  resetTurnSelection();
  if (game.mode==='local' && game.phase!=='finished' && game.current!==prior) handoff = true;
  render();
  if (game.mode==='cpu' && game.phase!=='finished') scheduleCPU();
}
function scheduleCPU() {
  if (!game || game.mode!=='cpu' || game.current!==1 || busy || game.phase==='finished' || helpOpen) return;
  busy = true;
  render();
  const scheduledGame = game;
  cpuTimer = setTimeout(() => {
    busy=false;
    if (game !== scheduledGame || !game || game.current!==1 || game.phase==='finished' || helpOpen) return;
    try {
      const action = chooseAIAction(game);
      if (action) dispatch(game,action);
      settleIfFinished();
    } catch(e) { notify(`CPU処理エラー: ${e.message}`); return; }
    resetTurnSelection();
    render();
    if (game.mode==='cpu' && game.current===1 && game.phase!=='finished') scheduleCPU();
  }, 530);
}
$app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action==='help') { helpOpen=true;render();return; }
  if (action==='close-help') { helpOpen=false;render();scheduleCPU();return; }
  if (action==='select-format' && !game) { selectedFormat=target.dataset.format;render();return; }
  if (action==='start-cpu') return start('cpu');
  if (action==='start-local') return start('local');
  if (action==='play-again') return start(game?.mode || 'cpu',match?.format || selectedFormat);
  if (action==='next-game') return advanceGame();
  if (action==='back-home') {clearTimeout(cpuTimer);game=null;match=null;handoff=false;helpOpen=false;render();return;}
  if (action==='restart') { if(window.confirm('現在の対局を終了して最初からやり直す？')) start(game.mode,match.format); return; }
  if (action==='reveal') { handoff=false;render();return; }
  if (!game || game.phase==='finished' || helpOpen || handoff || !isHumanTurn()) return;
  const id = Number(target.dataset.id);
  if (action==='select') {
    if (selected.includes(id)) selected=selected.filter(v=>v!==id);
    else if (selected.length<2) selected.push(id);
    else selected=[selected[1],id];
    render();return;
  }
  if (action==='flip') {flipped[id]=!flipped[id];render();return;}
  if (action==='clear') {resetTurnSelection();render();return;}
  if (action==='open') return run({type:'open',ids:[...selected],flips:selected.map(id=>Boolean(flipped[id]))});
  if (action==='passOpen') return run({type:'passOpen'});
  if (action==='attach') return run({type:'attach',ids:[...selected],moveKey:target.dataset.key});
  if (action==='passAttach') return run({type:'passAttach'});
  if (action==='adjust-draw') return run({type:'adjust',choice:'draw'});
  if (action==='adjust-none') return run({type:'adjust',choice:'none'});
  if (action==='adjust-exchange') return run({type:'adjust',choice:'exchange',id:selected[0]});
});
render();
