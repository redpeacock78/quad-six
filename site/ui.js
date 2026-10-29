import { newGame, dispatch, roleOf, isStronger, attachmentMoves, boardPorts, getTile, tilePips, totalScore, MARTIAL, DEFAULTS } from './engine.js?v=branch-visual-20261030c';
import { chooseAIAction } from './ai.js?v=branch-visual-20261030c';
import { MATCH_FORMATS, STARTING_POINTS, createMatch, settleMatchGame, nextMatchGame, matchWinner, matchRoundName } from './match.js?v=branch-visual-20261030c';


const $app = document.getElementById('app');
let game = null;
let match = null;
let selectedFormat = 'single';
let cpuTimer = null;
let selected = [];
let selectedMoveKey = null;
let flipped = {};
let helpOpen = false;
let handoff = false;
let inspectFinalBoard = false;
let busy = false;
let toastMessage = '';
let toastTimer = null;
const REPOSITORY_URL = 'https://github.com/redpeacock78/quad-six';
const GITHUB_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.637 22.41c.575.107.787-.25.787-.555 0-.274-.01-1-.016-1.963-3.201.696-3.877-1.542-3.877-1.542-.524-1.33-1.28-1.685-1.28-1.685-1.047-.717.079-.702.079-.702 1.16.081 1.77 1.19 1.77 1.19 1.029 1.763 2.7 1.254 3.358.96.105-.745.403-1.254.733-1.542-2.556-.29-5.24-1.278-5.24-5.686 0-1.256.45-2.283 1.187-3.089-.12-.291-.514-1.461.113-3.045 0 0 .967-.31 3.165 1.18a11.016 11.016 0 0 1 5.762 0c2.197-1.49 3.163-1.18 3.163-1.18.629 1.584.234 2.754.116 3.045.74.806 1.185 1.833 1.185 3.089 0 4.42-2.687 5.392-5.253 5.677.415.36.784 1.072.784 2.161 0 1.561-.014 2.82-.014 3.204 0 .307.21.667.795.553A11.503 11.503 0 0 0 12 .5Z"/></svg>';
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
// The graph is an SVG, so its pips must be SVG circles rather than the
// HTML-only .half/.pip spans used by hand tiles. Share the exact same PIPS
// table to keep both renderers visually and numerically consistent.
function svgPipHalf(value, x, y, width, height) {
  const radius = Math.min(3.5, width / 12, height / 10);
  return PIPS[value].map(([col,row]) =>
    `<circle class="board-pip" cx="${x+width*col/4}" cy="${y+height*row/4}" r="${radius}" fill="#17342d"/>`
  ).join('');
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
function currentHand(player = game.current) {
  if (!game) return '';
  const interactive = game.phase !== 'finished' && isHumanTurn() && !handoff;
  return game.hands[player].map(id => {
    const tile = getTile(game, id);
    const flip = Boolean(flipped[id]);
    return `<div class="tile-wrap">${tileDisplay(id, { flip:interactive && flip, button:interactive, selected:interactive && selected.includes(id) })}${interactive && game.phase==='opening' && tile.a !== tile.b ? `<button class="flip-control" data-action="flip" data-id="${id}" title="牌を反転">↻</button>` : ''}</div>`;
  }).join('');
}
// Directions in the engine describe the abstract local branch. The graph's
// compact tree layout bends those branches into lanes, so user-visible labels
// MUST be based on the rendered positions, not on port.direction/slot.
function visualPortDirection(port, layout) {
  if (!port || !layout) return '端点';
  const owner=layout.positions.get(port.owner);
  const marker=layout.portPositions.get(port.key);
  if (!owner || !marker) return '端点';
  const dx=layout.px(marker)-layout.px(owner),dy=marker.y-owner.y;
  if (Math.abs(dy)<layout.gapY/4) return dx<0?'左':'右';
  if (Math.abs(dx)<layout.gapX/4) return dy<0?'上':'下';
  return `${dx<0?'左':'右'}${dy<0?'上':'下'}`;
}
function formatPort(port, index, layout) {
  const label=visualPortDirection(port,layout);
  return `${label}（端点${index+1}・${port?.pip ?? '?'}）`;
}
function formatMove(move, layout) {
  const ports=boardPorts(game.board);
  const index=ports.findIndex(port=>port.key===move.portKey);
  if(move.special){
    const second=ports.findIndex(port=>port.key===move.portKey2);
    return `至尊・${formatPort(ports[index],index,layout)}＋${formatPort(ports[second],second,layout)}`;
  }
  return formatPort(ports[index],index,layout);
}
function activeAttachmentMove(moves) {
  return moves.find(move => move.key === selectedMoveKey) || (moves.length === 1 ? moves[0] : null);
}
function movesMarkup(moves, activeMove, layout) {
  if (!moves.length) return `<div class="empty-action">${selected.length ? '選んだ牌は今の開放端に接続できないよ' : '1枚か2枚を選んで接続方法を確認しよう'}</div>`;
  return `<div class="move-options" aria-label="付札の接続先">${moves.map(move => `<button type="button" class="move-option${activeMove?.key === move.key ? ' chosen' : ''}" data-action="choose-attachment" data-key="${safe(move.key)}" aria-pressed="${activeMove?.key === move.key}">${move.special?'✦ ':''}${formatMove(move,layout)}へ${move.placements.length}枚<span>${move.placements.map(v=>`[${v.a}｜${v.b}]`).join(' → ')} · +${move.placements.reduce((n,v)=>n+v.a+v.b,0)}点</span></button>`).join('')}</div>`;
}
function actionPanel() {
  const isCPU = !isHumanTurn();
  if (isCPU) return `<div class="help-text">CPUが次の一手を考えているよ…</div>`;
  if (game.phase === 'opening') {
    const ready = selected.length === 2;
    const role = ready ? roleOf(game,selected) : null;
    const allowed = role && isStronger(role, game.openingRole);
    const pending = game.board ? 'より強い役でレイズするか、見送って付札へ' : '手札から2枚選んで最初の役を置こう';
    return `<div class="action-head"><strong>${game.board?'レイズ勝負':'最初の役を出す'}</strong><span class="small-label">天九</span></div>
      <p class="help-text">${pending}${game.final?' · 最終局（パスで脱落）':''}</p>
      ${role ? `<div class="role-preview"><span>選択した役<br><strong>${safe(role.name)}</strong></span><span>役点 +${role.points} / ピップ +${selected.reduce((s,id)=>s+tilePips(getTile(game,id)),0)} ${!allowed?'<br>※ レイズ不可':''}</span></div>` : ''}
      <div class="action-buttons"><button class="button primary" data-action="open" ${!ready||!allowed?'disabled':''}>${game.board?'この役でレイズ':'役を場に出す'} ↗</button>
      ${(game.board || game.final) ? `<button class="button quiet" data-action="passOpen">${game.final?'パスして脱落':'レイズを見送る'}</button>` : ''}
      ${selected.length?'<button class="button quiet" data-action="clear">選び直す</button>':''}</div>`;
  }
  if (game.phase === 'attachment') {
    const moves = attachmentMoves(game, selected);
    const activeMove = activeAttachmentMove(moves);
    return `<div class="action-head"><strong>付札を出す</strong><span class="small-label">ドミノ</span></div>
      <p class="help-text">① 手札から1〜2枚選ぶ → ② 盤面の位置と端点番号で接続先を選ぶ → ③「付札を場に出す」で確定${game.openingRole?.tier==='supreme'?' · 至尊の平場は左右両側OK':''}${game.final?' · 最終局のパスは即脱落':''}</p>
      ${movesMarkup(moves, activeMove, graphLayout(game.board))}
      <div class="action-buttons attachment-actions"><button class="button primary" data-action="attach" ${activeMove?'':'disabled'}>付札を場に出す ↗</button><button class="button quiet" data-action="passAttach">${game.final?'パスして脱落':'パス · 1枚引く'}</button>${selected.length?'<button class="button quiet" data-action="clear">選び直す</button>':''}</div>`;
  }
  if (game.phase === 'adjustment') {
    const maxExchange = Math.min(game.hands[game.current].length, game.stock.length);
    const ready = selected.length >= 1 && selected.length <= maxExchange;
    return `<div class="action-head"><strong>手札調整</strong><span class="small-label">交換 / 補充</span></div>
      <p class="help-text">ポーカー式に好きな枚数をまとめて公開交換できるよ（手札全部もOK） · 交換牌は山札へ戻さず公開除外 · 山札残り${game.stock.length}枚</p>
      <div class="action-buttons adjustment-actions">
      <button class="button primary" data-action="adjust-exchange" ${ready?'':'disabled'}>${ready?`選んだ${selected.length}枚を交換`:'交換する牌を選ぶ'} ↗</button>
      <button class="button" data-action="select-all-exchange" ${maxExchange?'':'disabled'}>${maxExchange === game.hands[game.current].length ? `手札を全選択（${maxExchange}枚）` : `最大${maxExchange}枚を選択`}</button>
      <button class="button quiet" data-action="adjust-draw" ${game.stock.length?'':'disabled'}>1枚ドロー</button>
      <button class="button quiet" data-action="adjust-none">何もしない</button>
      ${selected.length?'<button class="button quiet" data-action="clear">選び直す</button>':''}</div>`;
  }
  return '';
}
function opponentHandMarkup(player) {
  const count = game.hands[player].length;
  return `<section class="opponent-hand" aria-label="${nameOf(player)}の手牌は${count}枚">
    <div class="opponent-heading"><span class="opponent-name">◇ ${nameOf(player)}の手牌</span><strong>残り ${count} 枚</strong>${game.phase!=='finished' && game.current===player?'<span class="opponent-turn">手番中</span>':''}</div>
    <div class="opponent-tiles" aria-hidden="true">${count ? Array.from({length:count},()=>dominoMarkup(0,0,{small:true,back:true})).join('') : '<span class="opponent-empty">手牌なし</span>'}</div>
  </section>`;
}

/** Tree layout: the two opening tiles remain connected at the center.
 * Descendants grow outward on their own root side, with each double's
 * three free arms displayed in separate vertical lanes.
 */
function graphLayout(board) {
  const items=board.items,ports=boardPorts(board);
  const byParent=new Map(),portByOwner=new Map();
  for(const item of items.slice(2)){
    if(!byParent.has(item.parent))byParent.set(item.parent,[]);
    byParent.get(item.parent).push(item);
  }
  for(const p of ports){
    if(!portByOwner.has(p.owner))portByOwner.set(p.owner,[]);
    portByOwner.get(p.owner).push(p);
  }
  const gapX=122,gapY=95;
  const positions=new Map(),portPositions=new Map();
  let maxLeft=0,maxRight=0;
  const layout=(root,side)=>{
    let row=0,maxDepth=0;
    const walk=(item,depth)=>{
      maxDepth=Math.max(maxDepth,depth);
      const kids=(byParent.get(item.id)||[]).map(v=>({slot:v.slot||0,node:v,kind:'node'}));
      const ends=(portByOwner.get(item.id)||[]).map(v=>({slot:v.slot||0,node:v,kind:'port'}));
      const ordered=[...kids,...ends].sort((a,b)=>(a.slot===1?-1:a.slot===2?1:0)-(b.slot===1?-1:b.slot===2?1:0));
      const childrenY=[];
      for(const part of ordered){
        if(part.kind==='node'){
          const y=walk(part.node,depth+1);
          childrenY.push(y);
        }else{
          // Open port markers occupy an extra column beyond their parent.
          maxDepth=Math.max(maxDepth,depth+1);
          const y=row++*gapY;
          portPositions.set(part.node.key,{depth:depth+1,y,side});
          childrenY.push(y);
        }
      }
      const y=childrenY.length?(childrenY[0]+childrenY[childrenY.length-1])/2:row++*gapY;
      positions.set(item.id,{depth,y,side,item});
      return y;
    };
    walk(root,0);
    const rootY=positions.get(root.id).y;
    for(const pos of positions.values())if(pos.side===side)pos.y-=rootY;
    for(const pos of portPositions.values())if(pos.side===side)pos.y-=rootY;
    if(side==='left')maxLeft=maxDepth;
    else maxRight=maxDepth;
  };
  layout(items[0],'left');
  layout(items[1],'right');
  const pad=90,rootLeftX=pad+maxLeft*gapX,rootRightX=rootLeftX+gapX;
  const px=pos=>(pos.side==='left'?rootLeftX-pos.depth*gapX:rootRightX+pos.depth*gapX);
  const yList=[...positions.values(),...portPositions.values()].map(p=>p.y);
  const minY=Math.min(...yList,0),maxY=Math.max(...yList,0),shiftY=pad-minY;
  const width=rootRightX+maxRight*gapX+pad;
  const height=Math.max(205,maxY-minY+pad*2);
  return {items,ports,positions,portPositions,px,width,height,shiftY,rootLeftX,rootRightX,gapX,gapY};
}
function branchingBoardMarkup() {
  const layout=graphLayout(game.board);
  const {items,ports,positions,portPositions,px,width,height,shiftY,rootLeftX,rootRightX}=layout;
  const links=[];
  const line=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1} H${(x1+x2)/2} V${y2} H${x2}" fill="none" stroke="#9abb97" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;
  // Physical edges follow the recorded parent references, not screen order.
  links.push(line(rootLeftX,shiftY,rootRightX,shiftY));
  for(const item of items.slice(2)){
    const from=positions.get(item.parent),to=positions.get(item.id);
    if(from&&to)links.push(line(px(from),from.y+shiftY,px(to),to.y+shiftY));
  }
  const portsMarkup=ports.map((port,i)=>{
    const pos=portPositions.get(port.key);
    const base=positions.get(port.owner);
    if(!pos||!base)return '';
    const x=px(pos),y=pos.y+shiftY;
    links.push(line(px(base),base.y+shiftY,x,y));
    const direction=visualPortDirection(port,layout);
    return `<g data-port-key="${port.key}" data-port-label="${formatPort(port,i,layout)}" role="img" aria-label="${formatPort(port,i,layout)}"><title>${formatPort(port,i,layout)}</title>
      <circle cx="${x}" cy="${y}" r="24" fill="#1a4a3c" stroke="#e2bc76" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="${x}" y="${y-3}" text-anchor="middle" font-size="15" font-weight="bold" fill="#f9df9e">${port.pip}</text>
      <text x="${x}" y="${y+14}" text-anchor="middle" font-size="11" fill="#f5e4bf">${direction}${i+1}</text></g>`;
  }).join('');
  const dominos=items.map((item,index)=>{
    const pos=positions.get(item.id);
    if(!pos)return '';
    const x=px(pos),y=pos.y+shiftY;
    const isDouble=item.a===item.b,vertical=isDouble&&index>=2;
    const w=vertical?46:80,h=vertical?72:46;
    const a=pos.side==='left'&&index>=2?item.b:item.a;
    const b=pos.side==='left'&&index>=2?item.a:item.b;
    return `<g transform="translate(${x} ${y})" aria-label="${a}｜${b}">
      <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="7"
        fill="${isDouble?'#f5dca6':'#f0e9d9'}" stroke="${isDouble?'#d3a85b':'#ad9872'}" stroke-width="2"/>
      ${vertical?
        `<line x1="${-w/2+3}" y1="0" x2="${w/2-3}" y2="0" stroke="#857968" stroke-width="1.5"/>
          ${svgPipHalf(a,-w/2,-h/2,w,h/2)}
          ${svgPipHalf(b,-w/2,0,w,h/2)}`:
        `<line x1="0" y1="${-h/2+3}" x2="0" y2="${h/2-3}" stroke="#857968" stroke-width="1.5"/>
          ${svgPipHalf(a,-w/2,-h/2,w/2,h)}
          ${svgPipHalf(b,0,-h/2,w/2,h)}`}
      </g>`;
  }).join('');
  return `<div class="board-graph" role="img" aria-label="分岐するドミノ盤面。開放端は${ports.length}か所">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
      ${links.join('')}${dominos}${portsMarkup}
    </svg></div>`;
}
function boardMarkup() {
  if (game.board?.ports) return branchingBoardMarkup();
  if (!game.board) return `<div class="board-empty"><div class="symbol">◇</div><strong>${game.phase==='finished'?'終局時の盤面は空です':'盤面はまだ空だよ'}</strong><small>${game.phase==='finished'?'このゲームで最後に場が流れた状態です':'平場で最初の役を置いて始めよう'}</small></div>`;
  const items = game.board.items, split = game.board.splitIndex;
  const leftItems = items.slice(0,split), rightItems=items.slice(split);
  const renderItems = (group) => group.map(v=>dominoMarkup(v.a,v.b)).join('');
  return `<div class="board-strip"><span class="edge-marker left" title="左の開放端">${items[0].a}</span><div class="board-group">${renderItems(leftItems)}</div><span class="root-joint" title="平場の2枚を繋ぐ中央の境界">✦</span><div class="board-group">${renderItems(rightItems)}</div><span class="edge-marker right" title="右の開放端">${items[items.length-1].b}</span></div>`;
}
function phaseLabel() {
  if (game.phase === 'opening') return '01 · 平場 / レイズ';
  if (game.phase === 'attachment') return '02 · 付札';
  if (game.phase === 'adjustment') return '03 · 手札調整';
  return '終局';
}
function scoreCard(p) {
  return `<div class="score-person ${game.current===p&&game.phase!=='finished'?'active':''}"><div><div class="player-name">${p===0?'◈':'◇'} ${nameOf(p)} ${game.finalOut[p]?'· 脱落':''}</div><div class="player-detail">手札 ${game.hands[p].length}枚 / 役 ${game.scores[p].role} / 付札等 ${game.scores[p].pips}</div></div><div class="points">${totalScore(game,p)}</div></div>`;
}
function currentRoundName() {
  if (!match) return '';
  // Settlement advances the next dealer before the recap is dismissed.
  // During final-table review, display the completed game's designation.
  const last = match.settled ? match.history.at(-1) : null;
  return matchRoundName(match.format, last ? last.hand : match.handNumber,
    last ? last.honba : match.honba);
}
function matchHandLabel() {
  if (!match) return '';
  return currentRoundName();
}
function matchPanel() {
  if (!match) return '';
  return `<section class="panel match-panel"><div class="side-section"><div class="side-title match-round-heading"><h3 class="match-round-name">${matchHandLabel()}</h3><span class="small-label">${MATCH_FORMATS[match.format].label} · 第${match.gameNumber}ゲーム · 親：${nameOf(match.settled?match.history.at(-1).dealer:match.dealer)}</span></div>
    <div class="match-points"><div><small>${nameOf(0)}</small><strong>${match.points[0]}</strong></div><div><small>${nameOf(1)}</small><strong>${match.points[1]}</strong></div></div>
    <p class="footnote">${match.format==='single'?'一局戦は連荘・本場点なし':'親の早アガリで連荘・本場＋1 · アガリ時に5×本場点'} · 得点差は持ち点に反映</p>
    ${match.history.length?`<details class="drawer"><summary>対局履歴（${match.history.length}ゲーム）</summary><table class="ledger"><thead><tr><th>局</th><th>得点差</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr></thead><tbody>${match.history.map(r=>`<tr><td class="match-history-round"><strong>${matchRoundName(match.format,r.hand,r.honba)}</strong><small>第${r.game}ゲーム${r.renchan?' · 連荘':''}</small></td><td>${r.delta>0?'+':''}${r.delta}</td><td>${r.points[0]}</td><td>${r.points[1]}</td></tr>`).join('')}</tbody></table></details>`:''}</div></section>`;
}
function sideMarkup() {
  const rows = game.rounds.map(r => `<tr><td>第${r.round}平場</td><td>${r.role[0]+r.pips[0]+r.raise[0]}</td><td>${r.role[1]+r.pips[1]+r.raise[1]}</td></tr>`).join('');
  const closed = game.discard.slice(-10).reverse();
  return `<aside class="side-column">${matchPanel()}
  <section class="panel"><div class="side-section"><div class="side-title"><h3>得点ボード</h3><span class="small-label">SCORE</span></div>${scoreCard(0)}${scoreCard(1)}<div class="round-lbl">※ 終局時にボーナス・残牌点を精算するよ</div></div>
  <div class="side-section"><div class="side-title"><h3>進行状況</h3></div><div class="side-stats"><div class="statbox"><div class="number">${game.stock.length}</div><div class="label">山札</div></div><div class="statbox"><div class="number">${game.discard.length}</div><div class="label">公開除外</div></div><div class="statbox"><div class="number">${game.raise}</div><div class="label">レイズ数</div></div></div>
  <details class="drawer"><summary>局別スコアと内訳を表示</summary><table class="ledger"><thead><tr><th>平場</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr></thead><tbody>${rows}<tr class="total"><td>累計</td><td>${totalScore(game,0)}</td><td>${totalScore(game,1)}</td></tr></tbody></table><p class="footnote">レイズ点は最終レイズ者が総取り · 親の本場点はゲーム終局時に加点</p></details>
  </div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>役の早見表</h3><span class="small-label">RANKS</span></div><div class="mini-role-list"><div class="mini-role"><span>✦ 至尊</span><b>20点</b></div><div class="mini-role"><span>Ⅱ 文牌 · 同じ牌2枚</span><b>15点</b></div><div class="mini-role"><span>Ⅲ 武牌 · 指定9組</span><b>10点</b></div><div class="mini-role"><span>Ⅳ 雑 · その他</span><b>5点</b></div></div><button class="button quiet tight full" style="margin-top:14px" data-action="help">武牌9種を見る →</button></div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>公開除外</h3><span class="small-label">DISCARD</span></div><div class="discards ${closed.length?'':'empty'}">${closed.length ? closed.map(id=>tileDisplay(id,{small:true})).join('') : 'まだ除外された牌はないよ'}</div>${game.discard.length>10?`<details class="drawer"><summary>すべての除外牌（${game.discard.length}枚）</summary><div class="discards" style="margin:10px 0">${game.discard.map(id=>tileDisplay(id,{small:true})).join('')}</div></details>`:''}</div></section>
  <section class="panel"><div class="side-section"><div class="side-title"><h3>対局ログ</h3></div>${game.history.slice(0,8).map(l=>`<div class="log-entry"><small>第${l.round}平場</small>${safe(l.text)}</div>`).join('')}</div></section>
  </aside>`;
}
function gameMarkup() {
  const current=game.mode==='cpu'?0:game.current;
  const opponent=1-current;
  const human=isHumanTurn();
  const finished=game.phase==='finished';
  const show=finished || (!handoff && (human || game.mode==='cpu'));
  const hand = show?`<div class="hand-strip">${currentHand(current) || '<div class="empty-action">手札がないよ</div>'}</div>`:`<div class="hand-privacy">次のプレイヤーが手札を確認するまで非公開</div>`;
  const ports=boardPorts(game.board);
  return `<section class="game-layout"><div class="main-column">
    ${finished && inspectFinalBoard?`<div class="panel panel-pad board-review-toolbar"><div><span class="eyebrow">FINAL TABLE · ${currentRoundName()} · 第${match.gameNumber}ゲーム</span><strong>終局時の盤面を確認中</strong></div><button class="button primary" data-action="back-to-result">← 精算結果に戻る</button></div>`:''}
    <div class="panel panel-pad statusbar"><div class="statusbar-left"><span class="pill ${game.final?'final-tag':''}">${game.final?`${currentRoundName()} · 最終出牌`:`${currentRoundName()} · 第${game.round}平場`}</span><div class="phase-label">${phaseLabel()}</div><span class="minor">${finished?'最終盤面を表示中':game.final?'山札なし・パスで脱落':'交互手番制'}</span></div><div class="turn-indicator"><i class="turn-dot ${game.current===1?'cpu':''}"></i>${finished?'ゲーム終了':`${nameOf(game.current)}の番`}</div></div>
    <section class="playmat"><div class="mat-heading"><div><span class="eyebrow">THE TABLE</span><h2>${game.openingRole?`平場役 · ${safe(game.openingRole.name)}`:finished?'最終盤面 · 場に牌なし':'最初の役を待っています'}</h2></div><div class="mat-side-info">${game.board?`${game.board.items.length}枚が場にある`:finished?'場に残った牌なし':'役は2枚で出す'}<br>${game.final?'最終出牌':'役は天九 · 接続はドミノ'}</div></div>${opponentHandMarkup(opponent)}<div class="board-holder" id="board-holder">${boardMarkup()}</div><div class="mat-footer"><span>開放端 <b>${ports.length}か所</b></span><span>${game.openingRole?.tier==='supreme'?'至尊：左右両側の起点が有効':'同じ数字の枝に接続 · 盤面の位置と端点番号で選択'}</span><span>数字 <b>${ports.map(p=>p.pip).join('・')||'—'}</b></span></div></section>
    <section class="panel hand-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR HAND</span><h2>${nameOf(current)}の${finished?'残り手札':'手札'} ${game.hands[current].length}枚</h2></div><span class="pill">${finished?'終局':`選択 ${selected.length} / ${game.phase==='adjustment'?Math.min(game.hands[current].length,game.stock.length):2}`}</span></div>${hand}<div class="action-area">${finished?`<div class="board-review-actions"><span class="help-text">ゲーム終了時点の盤面です。残った相手の手牌は裏向きで表示しています。</span><button class="button primary" data-action="back-to-result">精算結果に戻る →</button></div>`:show?actionPanel():`<div class="help-text">${handoff?'端末を次のプレイヤーへ渡してね':'CPUが考えています…'}</div>`}</div></section>
   </div>${sideMarkup()}</section>`;
}
function headerMarkup() {
  return `<header class="masthead"><button type="button" class="brand brand-home" data-action="go-home" title="タイトル画面へ戻る" aria-label="賽棋 Quad6 — タイトル画面へ戻る"><div class="brand-symbol">賽</div><div><div class="brand-text">賽棋 <span style="font-size:13px;color:var(--gold);letter-spacing:.05em">QUAD6</span></div><div class="brand-sub">THE DOMINO STRATEGY GAME</div></div></button><div class="header-actions">${game?`<span class="pill">${MATCH_FORMATS[match.format].label} · ${game.mode==='cpu'?'VS CPU':'LOCAL 2P'}</span>`:''}<a class="button quiet tight github-link" href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" title="GitHubリポジトリを開く" aria-label="GitHubリポジトリを新しいタブで開く">${GITHUB_ICON}<span>GitHub</span></a><button class="button quiet tight" data-action="help">ルール</button>${game?'<button class="button tight" data-action="restart">新しい対局</button>':''}</div></header>`;
}
function introDomino(a,b,extra='') { return `<div class="intro-domino" ${extra}>${dominoMarkup(a,b,{large:true})}</div>`; }
function homeMarkup(){
  return `<main class="intro"><div class="intro-copy"><span class="eyebrow">A GAME OF FIFTY-SIX TILES</span><h1>二人で競う。<br><em>五十六の選択。</em></h1><p class="lead">天九の「役」と、ドミノの「接続」。<br>レイズで競り、牌を繋ぎ、山の行方を読む。<br>道具は56枚のドミノと紙と鉛筆だけ。<br>古くて新しい、2人用の知略ゲーム。</p><div class="format-picker" role="group" aria-label="対局形式"><span class="eyebrow">対局形式を選択</span><div class="format-buttons">${Object.entries(MATCH_FORMATS).map(([id, f])=>`<button class="button format-choice ${selectedFormat===id?'chosen':''}" data-action="select-format" data-format="${id}" aria-pressed="${selectedFormat===id}">${f.label}<small>${f.games}${id==='single'?'ゲーム':'親番'}</small></button>`).join('')}</div><p class="help-text">初期持ち点は各250点 · 最初の親はランダム · 親の早アガリで連荘 · 1本場につき＋5点</p></div><div class="intro-actions"><button class="button primary large" data-action="start-cpu">CPUと対戦する →</button><button class="button large" data-action="start-local">同じ端末で2人対戦</button></div><div class="intro-feature"><div><b>56</b>DOMINO TILES</div><div><b>9</b>STARTING HAND</div><div><b>2</b>PLAYERS</div><div><b>0</b>INSTALL REQUIRED</div></div></div><div class="intro-visual"><div class="intro-mandala"></div>${introDomino(6,6)}${introDomino(0,0)}${introDomino(5,3)}${introDomino(2,4)}<div class="intro-title"><div class="kanji">賽棋</div><div class="roman">QUAD6</div><div class="intro-foot">A WAR OF WITS</div></div></div></main>`;
}
function helpMarkup() {
  const examples = MARTIAL.map(([name, a, b]) => `<tr><td>${name}</td><td>[${a.split('-').join('｜')}] + [${b.split('-').join('｜')}]</td></tr>`).join('');
  return `<div class="overlay" role="presentation" data-action="dismiss-help"><div class="modal" role="dialog" aria-modal="true" aria-label="ルールブック"><span class="eyebrow">HOW TO PLAY · VER 0.5</span><h2>賽棋のあそびかた</h2><p>2人に9枚ずつ配ってスタート · 役を作って場に出し、その後は数字を繋ぐ · 手札をなくすか山札が尽きたら精算するよ</p>
  <h3>対局形式と持ち点</h3><p>一局戦は1ゲーム。東風戦は東1〜東4局、半荘戦は東1〜東4局・南1〜南4局。親連荘では同じ局名のまま本場数が増えるよ。250点ずつ開始し、各ゲームの得点差を持ち点間で移動するよ。最初の親はランダム。親が早アガリしたら同じ親番を連荘し、本場が1増えるよ。子が早アガリしたり山枯らしで終了した場合は親が交代して本場は0に戻るよ。連荘分はゲーム数が増えるよ。単発の一局戦では連荘・本場点なし。飛び終了なし。</p>
  <h3>① 平場：天九</h3><p>先攻が2枚で役を出し、相手はより強い役でレイズできるよ · レイズされた牌は公開除外されるけど、得点は残る · レイズが終わったら最後の役を起点に付札へ進むよ · レイズ点は最後のレイズ者が総取りだよ</p>
  <table class="mini-table"><tr><th>階級</th><th>役</th><th>役点</th></tr><tr><td>最高</td><td>至尊 [6｜6] + [0｜0]</td><td>20</td></tr><tr><td>上</td><td>文牌：同じ牌2枚</td><td>15</td></tr><tr><td>中</td><td>武牌：次の指定9組</td><td>10</td></tr><tr><td>下</td><td>雑：その他の2枚</td><td>5</td></tr></table>
  <h3>武牌9種の役表</h3><table class="mini-table"><tr><th>役</th><th>2枚組</th></tr>${examples}</table>
  <p class="footnote">文牌は原則ピップ合計で比較するよ · ただし [0｜0] の対子だけは [6｜6] の対子に勝つ特例があるよ · 雑同士のレイズは不可としているよ</p>
  <h3>② 付札：ドミノ</h3><p>最初の付札で左右どちらかの起点を選ぶよ · その後の通常付札は選んだ側の枝だけに接続（反対側の起点は閉じる） · ただし平場役が至尊 [6｜6]＋[0｜0] の場合は左右の起点を閉じず、両側から付札を続けられるよ · 1手で1枚か2枚を同じ枝に連続接続するよ · ゾロ目のダブル牌を置くと縦置きになり、接続した方向以外の3方向が開放されるよ · 枝は全部独立して伸ばせる · 至尊 [0｜0]＋[6｜6] だけは例外として数字0と6の2つの開放端へ同時に付札できるよ</p>
  <h3>③ パスと局の終了</h3><p>通常の付札でパスすると山札から1枚引くよ · 両者が連続パスしたら場の牌をすべて公開除外し、第N平場とレイズ数をリセットするよ（麻雀式の東N局・南N局とは別） · 局間は1枚ドロー / 手札から任意枚数の公開交換 / 何もしない、から各自1回選べるよ · 交換は手札全部までOK（山札の残数が上限） · 除外した牌は山札に戻さず同数を補充するよ</p>
  <h3>④ 終局と得点</h3><p>手札0枚なら早アガリで即終了、山札0枚なら最後の付札を続けて精算するよ · 最終付札中のパスは脱落になるよ</p>
  <table class="mini-table"><tr><th>項目</th><th>計算</th></tr><tr><td>役とピップ</td><td>出したときに加算</td></tr><tr><td>レイズ点</td><td>平場のレイズ回数×3点を最終レイズ者へ</td></tr><tr><td>本場点</td><td>東風・半荘のみ。早アガリした側に5×現在の本場数</td></tr><tr><td>早アガリ</td><td>+15点</td></tr><tr><td>山を最後に引いた人</td><td>−15点（強制補充を除く）</td></tr><tr><td>残った手札</td><td>ピップ合計÷2、切り上げで減点</td></tr></table>
  <p class="footnote">実装上の暫定裁定：平場の2枚は中央に並べ、外側に見えている数字を左右の開放端にするよ · 平場の見送り側が最初の付札を行うよ · 雑同士のレイズは不可 · 付札の至尊には役点は追加しないよ · 各ゲーム内の平場先攻は局ごとに交代するよ</p>
  <div class="modal-actions"><button class="button primary" data-action="close-help">盤面に戻る</button></div></div></div>`;
}
function endMarkup() {
  const scores = [totalScore(game,0),totalScore(game,1)];
  const record = match?.history.at(-1);
  const isComplete = Boolean(match?.complete);
  const winner = isComplete ? matchWinner(match) : record?.winner;
  const itemRows = ['role','pips','raise','early','tableHonba','lastDraw','remaining'];
  const labels = {role:'役点',pips:'ピップ点',raise:'レイズ点',early:'早アガリ',tableHonba:'本場点',lastDraw:'山枯らし減点',remaining:'残牌減点'};
  return `<div class="overlay" data-action="dismiss-results"><div class="modal" role="dialog" aria-modal="true"><span class="eyebrow">${isComplete?'MATCH SET · FINAL STANDINGS':'GAME SET · SCORE SETTLEMENT'}</span><h2>${isComplete?(winner===null?'対局終了 · 引き分け！':`${nameOf(winner)}の総合勝利！`):`${currentRoundName()} 終了`}</h2>
  <p>${game.endReason==='early'?'早アガリで終局':'山札が尽きて最終出牌終了'} · ${match.format==='single'?'一局戦':matchRoundName(match.format,record.hand,record.honba)}${record.renchan?' · 親連荘！':''} · ${isComplete?'対局終了':'次ゲームへ'}</p>
  <div class="winner-row"><span class="win-number">${scores[0]} <span style="font-size:21px;color:#cbd7c9">—</span> ${scores[1]}</span></div><div class="review-entry"><button class="button primary" data-action="inspect-board">◇ 終局時の盤面を見る →</button></div>
  <table class="mini-table"><tr><th>このゲームの内訳</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th></tr>${itemRows.map(k=>`<tr><td>${labels[k]}</td><td>${k==='lastDraw'||k==='remaining'?'-':''}${game.scores[0][k]}</td><td>${k==='lastDraw'||k==='remaining'?'-':''}${game.scores[1][k]}</td></tr>`).join('')}<tr><th>ゲーム得点</th><th>${scores[0]}</th><th>${scores[1]}</th></tr></table>
  <div class="settlement"><span>得点差 ${record?.delta>0?'+':''}${record?.delta??0}点 → 持ち点に反映</span><div class="match-points"><div><small>${nameOf(0)}</small><strong>${match.points[0]}</strong></div><div><small>${nameOf(1)}</small><strong>${match.points[1]}</strong></div></div></div>
  ${isComplete?`<h3>総合成績</h3><table class="mini-table"><tr><th>局</th><th>${nameOf(0)}</th><th>${nameOf(1)}</th><th>得点差</th></tr>${match.history.map(r=>`<tr><td class="match-history-round"><strong>${matchRoundName(match.format,r.hand,r.honba)}</strong><small>第${r.game}ゲーム</small></td><td>${r.scores[0]}</td><td>${r.scores[1]}</td><td>${r.delta>0?'+':''}${r.delta}</td></tr>`).join('')}<tr><th>最終持ち点</th><th>${match.points[0]}</th><th>${match.points[1]}</th><th>合計500</th></tr></table>`:''}
  <div class="modal-actions">${isComplete?`<button class="button primary large" data-action="play-again">同じ形式でもう一戦！</button>`:`<button class="button primary large" data-action="next-game">次のゲームへ →</button>`}<button class="button quiet" data-action="back-home">タイトルへ</button></div></div></div>`;
}
function handoffMarkup() {
  return `<div class="overlay"><div class="modal privacy-view" role="dialog" aria-modal="true"><div class="symbol">◇</div><span class="eyebrow">PASS THE DEVICE</span><div class="title">${nameOf(game.current)}の番だよ</div><p>相手に手札が見えないよう端末を渡してね</p><div class="modal-actions" style="justify-content:center"><button class="button primary large" data-action="reveal">手札を確認して始める</button></div></div></div>`;
}
function render() {
  $app.innerHTML = `<div class="app-shell">${headerMarkup()}${game ? gameMarkup():homeMarkup()}<footer class="subfoot"><span>© Quad6 / 賽棋 · 2人用試遊版 · 無料 · インストール不要</span><span>天九の役 × ドミノの接続 × 累積得点 · <a class="source-link" href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer">GitHubでソースを見る</a></span></footer></div>${helpOpen?helpMarkup():''}${game&&game.phase==='finished'&&!helpOpen&&!inspectFinalBoard?endMarkup():''}${game&&handoff&&game.phase!=='finished'&&!helpOpen?handoffMarkup():''}${toastMessage?`<div class="toast" role="status">${safe(toastMessage)}</div>`:''}`;
}
function notify(message) {
  toastMessage = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMessage = ''; render(); }, 3100);
  render();
}
function resetTurnSelection() { selected = []; selectedMoveKey = null; flipped = {}; }
function goHome(confirmExit = true) {
  if (confirmExit && game && game.phase !== 'finished' && !window.confirm('現在の対局を終了してタイトルへ戻る？ 進行状況は失われます。')) return;
  clearTimeout(cpuTimer);
  clearTimeout(toastTimer);
  cpuTimer = null;
  game = null;
  match = null;
  busy = false;
  handoff = false;
  inspectFinalBoard = false;
  helpOpen = false;
  toastMessage = '';
  resetTurnSelection();
  render();
  window.scrollTo?.({top:0,behavior:'smooth'});
}
function showFinalBoard() {
  if (!game || game.phase !== 'finished') return;
  inspectFinalBoard = true;
  render();
  window.scrollTo?.({top:0,behavior:'smooth'});
}
function start(mode, format = selectedFormat) {
  clearTimeout(cpuTimer);
  const seed = Date.now() + Math.floor(Math.random()*100000);
  match = createMatch({ format, mode, initialHand:9, seed });
  game = match.game;
  selectedFormat = format;
  inspectFinalBoard = false;
  helpOpen = false;
  handoff = mode==='local';
  busy = false;
  resetTurnSelection();
  render();
  // The CPU may be drawn as the opening parent; let it make the first bid.
  scheduleCPU();
}
function settleIfFinished() {
  if (match && game.phase === 'finished') settleMatchGame(match);
}
function advanceGame() {
  if (!match?.settled || match.complete) return;
  clearTimeout(cpuTimer);
  game = nextMatchGame(match, Date.now() + Math.floor(Math.random()*100000));
  inspectFinalBoard = false;
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
  // Only the backdrop itself dismisses a modal; clicks inside its panel are ignored.
  if (action==='dismiss-help') {
    if (event.target === target) { helpOpen=false;render();scheduleCPU(); }
    return;
  }
  if (action==='dismiss-results') {
    if (event.target === target) showFinalBoard();
    return;
  }
  if (action==='help') { helpOpen=true;render();return; }
  if (action==='close-help') { helpOpen=false;render();scheduleCPU();return; }
  if (action==='go-home') return goHome();
  if (action==='select-format' && !game) { selectedFormat=target.dataset.format;render();return; }
  if (action==='start-cpu') return start('cpu');
  if (action==='start-local') return start('local');
  if (action==='inspect-board') return showFinalBoard();
  if (action==='back-to-result' && game?.phase==='finished') { inspectFinalBoard=false;render();return; }
  if (action==='play-again') return start(game?.mode || 'cpu',match?.format || selectedFormat);
  if (action==='next-game') return advanceGame();
  if (action==='back-home') return goHome(false);
  if (action==='restart') { if(window.confirm('現在の対局を終了して最初からやり直す？')) start(game.mode,match.format); return; }
  if (action==='reveal') { handoff=false;render();return; }
  if (!game || game.phase==='finished' || helpOpen || handoff || !isHumanTurn()) return;
  const id = Number(target.dataset.id);
  if (action==='select') {
    const max = game.phase === 'adjustment' ? Math.min(game.hands[game.current].length, game.stock.length) : 2;
    if (selected.includes(id)) selected=selected.filter(v=>v!==id);
    else if (selected.length<max) selected.push(id);
    else if (game.phase !== 'adjustment') selected=[selected[1],id];
    selectedMoveKey = null;
    render();return;
  }
  if (action==='flip') {flipped[id]=!flipped[id];render();return;}
  if (action==='clear') {resetTurnSelection();render();return;}
  if (action==='open') return run({type:'open',ids:[...selected],flips:selected.map(id=>Boolean(flipped[id]))});
  if (action==='passOpen') return run({type:'passOpen'});
  if (action==='choose-attachment') {
    if (!attachmentMoves(game, selected).some(move => move.key === target.dataset.key)) return;
    selectedMoveKey = target.dataset.key;
    render();return;
  }
  if (action==='attach') {
    const move = activeAttachmentMove(attachmentMoves(game, selected));
    if (!move) return;
    return run({type:'attach',ids:[...selected],moveKey:move.key});
  }
  if (action==='passAttach') return run({type:'passAttach'});
  if (action==='select-all-exchange' && game.phase==='adjustment') {
    const max = Math.min(game.hands[game.current].length, game.stock.length);
    selected = game.hands[game.current].slice(0, max);
    selectedMoveKey = null;
    render();return;
  }
  if (action==='adjust-draw') return run({type:'adjust',choice:'draw'});
  if (action==='adjust-none') return run({type:'adjust',choice:'none'});
  if (action==='adjust-exchange' && selected.length && selected.length<=game.stock.length) return run({type:'adjust',choice:'exchange',ids:[...selected]});
});
render();
