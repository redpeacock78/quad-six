/** 賽棋 Quad6 — dependency-free, deterministic rule engine. */

export const MARTIAL = [
  ['雑十', '4-6', '5-5', 10],
  ['雑九', '3-6', '4-5', 9],
  ['雑八', '2-6', '3-5', 8],
  ['雑七', '2-5', '3-4', 7],
  ['雑六', '1-5', '2-4', 6],
  ['雑五', '1-4', '2-3', 5],
  ['雑四', '0-4', '1-3', 4],
  ['雑三', '0-3', '1-2', 3],
  ['雑二', '0-2', '1-1', 2],
];

const MARTIAL_LOOKUP = new Map(MARTIAL.map(([name, x, y, level]) => [pairKey(x, y), { name, level }]));
export const ROLE_POINTS = { supreme: 20, civil: 15, martial: 10, common: 5 };
export const DEFAULTS = { initialHand: 9, raiseUnit: 3, earlyBonus: 15, lastDrawPenalty: 15 };

function pairKey(a, b) { return [a, b].sort().join('+'); }
function random(seed) {
  let x = seed >>> 0;
  return () => {
    x += 0x6D2B79F5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const tileKey = (tile) => `${Math.min(tile.a, tile.b)}-${Math.max(tile.a, tile.b)}`;
export const tilePips = (tile) => tile.a + tile.b;
export const getTile = (game, id) => game.tiles[id];
export const totalScore = (game, player) => {
  const s = game.scores[player];
  return s.role + s.pips + s.raise + s.tableHonba + s.early - s.lastDraw - s.remaining;
};
export function tileset() {
  const tiles = [];
  for (let copy = 0; copy < 2; copy++) {
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) tiles.push({ id: tiles.length, a, b, copy });
    }
  }
  return tiles;
}
export function roleOf(game, ids) {
  assert(ids.length === 2, '役は2枚で構成する');
  const [a, b] = ids.map(id => tileKey(getTile(game, id)));
  if (pairKey(a, b) === pairKey('6-6', '0-0')) return { tier: 'supreme', name: '至尊', level: 99, points: 20 };
  if (a === b) {
    const tile = getTile(game, ids[0]);
    return { tier: 'civil', name: `文牌 ${tile.a}｜${tile.b}`, level: tile.a + tile.b, key: a, points: 15 };
  }
  const martial = MARTIAL_LOOKUP.get(pairKey(a, b));
  if (martial) return { tier: 'martial', name: martial.name, level: martial.level, points: 10 };
  return { tier: 'common', name: '雑', level: 0, points: 5 };
}
export function isStronger(next, current) {
  if (!current) return true;
  const tier = { common: 0, martial: 1, civil: 2, supreme: 3 };
  if (tier[next.tier] !== tier[current.tier]) return tier[next.tier] > tier[current.tier];
  if (next.tier === 'civil') {
    // 0|0 pair is otherwise lowest, but it alone defeats the 6|6 pair.
    if (next.key === '0-0' && current.key === '6-6') return true;
    if (next.key === '6-6' && current.key === '0-0') return false;
  }
  return next.level > current.level;
}
function shuffle(ids, seed) {
  const rng = random(seed);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
}
function record(game, text, by = null) {
  game.history.unshift({ round: game.round, text, by });
  game.history.length = Math.min(70, game.history.length);
}
function stats(game) { return game.rounds[game.rounds.length - 1]; }
function award(game, player, field, points) {
  game.scores[player][field] += points;
  if (field === 'role' || field === 'pips' || field === 'raise') stats(game)[field][player] += points;
}
function other(p) { return 1 - p; }
function beginRound(game) {
  game.board = null;
  game.openingRole = null;
  game.raise = 0;
  game.lastOverwriter = null;
  game.passStreak = 0;
  game.adjustDone = [false, false];
  game.phase = 'opening';
  game.current = game.lead;
  game.rounds.push({ round: game.round, role: [0, 0], pips: [0, 0], raise: [0, 0] });
}
export function newGame({ mode = 'cpu', initialHand = 9, seed = Date.now(), startingPlayer = 0 } = {}) {
  assert(startingPlayer === 0 || startingPlayer === 1, '先手は0か1');
  assert(initialHand >= 2 && initialHand <= 16, '初期手札は2〜16枚');
  const tiles = tileset();
  const stock = tiles.map(t => t.id);
  shuffle(stock, seed);
  const hands = [[], []];
  for (let i = 0; i < initialHand; i++) for (let p = 0; p < 2; p++) hands[p].push(stock.pop());
  const game = {
    version: 3, mode, seed, tiles, stock, hands,
    discard: [], board: null, current: startingPlayer, lead: startingPlayer, phase: 'opening', round: 1,
    final: false, finalOut: [false, false], lastDrawBy: null, lastDrawExempt: false,
    openingRole: null, raise: 0, lastOverwriter: null, passStreak: 0,
    scores: [0, 1].map(() => ({ role: 0, pips: 0, raise: 0, tableHonba: 0, early: 0, lastDraw: 0, remaining: 0 })),
    rounds: [], history: [], adjustDone: [false, false], endReason: null, endWinner: null,
    initialHand
  };
  beginRound(game);
  record(game, `対局開始 · 各${initialHand}枚 · 山札${stock.length}枚`);
  return game;
}
export function handPairs(game, player = game.current, strongerOnly = false) {
  const hand = game.hands[player], result = [];
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
    const ids = [hand[i], hand[j]];
    const role = roleOf(game, ids);
    if (!strongerOnly || isStronger(role, game.openingRole)) result.push({ ids, role });
  }
  return result;
}
function removeHand(game, p, ids) {
  assert(new Set(ids).size === ids.length, '同じ牌を2度指定できません');
  for (const id of ids) assert(game.hands[p].includes(id), '手札に存在しない牌');
  game.hands[p] = game.hands[p].filter(id => !ids.includes(id));
}
function oriented(game, id, flip = false) {
  const t = getTile(game, id);
  return { id, a: flip ? t.b : t.a, b: flip ? t.a : t.b };
}
function checkEndHand(game, player) {
  if (game.hands[player].length === 0) {
    finish(game, 'early', player);
    return true;
  }
  return false;
}
function settleOpening(game, passedBy) {
  if (game.raise > 0 && game.lastOverwriter != null) {
    const pts = game.raise * DEFAULTS.raiseUnit;
    award(game, game.lastOverwriter, 'raise', pts);
    record(game, `${game.raise}レイズ · P${game.lastOverwriter + 1}が${pts}点総取り`, game.lastOverwriter);
  }
  game.phase = 'attachment';
  game.passStreak = 0;
  game.current = game.final && game.finalOut[passedBy] ? other(passedBy) : passedBy;
  record(game, '付札フェーズ開始');
}
function nextActive(game, player) { return game.final && game.finalOut[other(player)] ? player : other(player); }
function finish(game, reason, winner = null) {
  if (game.phase === 'finished') return;
  const previousPhase = game.phase;
  game.phase = 'finished';
  game.endReason = reason;
  game.endWinner = reason === 'early' ? winner : null;
  if (reason === 'early') {
    // A last-tile opening bid can end the game before normal bidding settlement.
    if (previousPhase === 'opening' && game.raise > 0 && game.lastOverwriter !== null) {
      award(game, game.lastOverwriter, 'raise', game.raise * DEFAULTS.raiseUnit);
    }
    game.scores[winner].early = DEFAULTS.earlyBonus;
    game.lastDrawBy = null; // early finish overrides LO penalty
    record(game, `P${winner + 1} 早アガリ · +${DEFAULTS.earlyBonus}点`, winner);
  } else if (game.lastDrawBy !== null && !game.lastDrawExempt) {
    game.scores[game.lastDrawBy].lastDraw = DEFAULTS.lastDrawPenalty;
  }
  for (let p = 0; p < 2; p++) {
    const pip = game.hands[p].reduce((a, id) => a + tilePips(getTile(game, id)), 0);
    game.scores[p].remaining = Math.ceil(pip / 2);
  }
  record(game, '終局 · 最終精算');
}
function toFinal(game, player, exempt = false) {
  if (game.final || game.phase === 'finished') return;
  game.final = true;
  game.finalOut = [false, false];
  game.lastDrawBy = player;
  game.lastDrawExempt = exempt;
  game.passStreak = 0;
  if (game.phase === 'adjustment') {
    game.phase = 'opening';
    game.current = game.lead;
  }
  record(game, exempt ? '強制補充による山枯らし · 罰点なし' : `P${player + 1}が最後の牌を引いた · 最終出牌へ`, player);
}
function draw(game, player, exempt = false) {
  if (game.stock.length === 0) return false;
  game.hands[player].push(game.stock.pop());
  if (game.stock.length === 0) toFinal(game, player, exempt);
  return true;
}
function endRound(game) {
  if (game.board) game.discard.push(...game.board.items.map(p => p.id));
  record(game, `第${game.round}局終了 · 場の牌を公開除外`);
  game.board = null;
  game.openingRole = null;
  game.raise = 0;
  game.lastOverwriter = null;
  game.passStreak = 0;
  game.round += 1;
  game.lead = other(game.lead);
  game.current = game.lead;
  game.phase = 'adjustment';
  game.adjustDone = [false, false];
  // If stock empties exactly after a normal pass, toFinal prevents resetting.
}
function startAfterAdjust(game) {
  // Special mandatory refill of 2 for a one-tile hand; if it exhausts stock, final play starts without LO penalty.
  for (let p = 0; p < 2; p++) {
    if (game.hands[p].length !== 1) continue;
    record(game, `P${p + 1} 手札1枚 · 2枚の強制補充`, p);
    for (let k = 0; k < 2; k++) {
      if (!draw(game, p, true)) break;
    }
    if (game.final) break;
  }
  beginRound(game);
  if (game.final) {
    game.current = game.lead;
    record(game, '場が空の状態から最終平場を開始');
  } else record(game, `第${game.round}局開始`);
}
function orientationVariants(game, id) {
  const t = getTile(game, id);
  if (t.a === t.b) return [oriented(game, id, false)];
  return [oriented(game, id, false), oriented(game, id, true)];
}

/** Live endpoints of the branching domino graph. */
export function boardPorts(board) {
  if(!board)return [];
  if(Array.isArray(board.ports))return board.ports;
  const a=board.items||[];
  return a.length?[{key:'root-left',owner:a[0].id,pip:a[0].a,side:'left',slot:0,root:true},{key:'root-right',owner:a[a.length-1].id,pip:a[a.length-1].b,side:'right',slot:0,root:true}]:[];
}
function initialPorts(items) {
  return [{key:'root-left',owner:items[0].id,pip:items[0].a,side:'left',slot:0,root:true},
    {key:'root-right',owner:items[1].id,pip:items[1].b,side:'right',slot:0,root:true}];
}
function outgoingPorts(v,side){
  return Array.from({length:v.a===v.b?3:1},(_,slot)=>({key:`tile-${v.id}-${slot}`,owner:v.id,pip:v.b,side,slot,root:false}));
}
/** Normal play is limited to one active endpoint; only Supreme splits two. */
export function attachmentMoves(game,ids,player=game.current){
  if(game.phase!=='attachment'||!game.board||ids.length<1||ids.length>2)return [];
  if(new Set(ids).size!==ids.length||ids.some(id=>!game.hands[player].includes(id)))return [];
  ids=[...ids].sort((a,b)=>a-b);
  const ports=boardPorts(game.board),out=[],seen=new Set();
  const push=(port,placements,special=false,secondPort=null)=>{
    const target=secondPort?`${port.key}+${secondPort.key}`:port.key;
    const visible=`${target}:${placements.map(v=>`${v.a}/${v.b}`).join(':')}`;
    if(seen.has(visible))return;
    seen.add(visible);
    const key=`${target}:${placements.map(v=>`${v.id}/${v.a}/${v.b}`).join(':')}`;
    out.push({key,portKey:port.key,portKey2:secondPort?.key||null,
      side:special?'both':port.root?port.side:'branch',
      portLabel:port.root?(port.side==='left'?'左起点':'右起点'):`${port.pip}の枝（${port.key}）`,
      placements,special,endValue:placements[placements.length-1].b});
  };
  for(const port of ports){
    if(ids.length===1){for(const v of orientationVariants(game,ids[0]))if(v.a===port.pip)push(port,[v]);}
    else for(const order of [ids,[ids[1],ids[0]]]){
      for(const a of orientationVariants(game,order[0])){
        if(a.a!==port.pip)continue;
        for(const b of orientationVariants(game,order[1]))if(b.a===a.b)push(port,[a,b]);
      }
    }
  }
  if(ids.length===2){
    const keys=ids.map(id=>tileKey(getTile(game,id)));
    if(pairKey(...keys)===pairKey('0-0','6-6')){
      const zero=oriented(game,ids[keys.indexOf('0-0')]);
      const six=oriented(game,ids[keys.indexOf('6-6')]);
      for(const p0 of ports.filter(p=>p.pip===0))
        for(const p6 of ports.filter(p=>p.pip===6&&p.key!==p0.key))
          push(p0,[zero,six],true,p6);
    }
  }
  return out;
}
export function allAttachmentMoves(game, player = game.current) {
  const hand = game.hands[player];
  const result = [];
  for (let i = 0; i < hand.length; i++) {
    result.push(...attachmentMoves(game, [hand[i]], player));
    for (let j = i + 1; j < hand.length; j++) result.push(...attachmentMoves(game, [hand[i], hand[j]], player));
  }
  return result;
}
export function dispatch(game, action) {
  assert(game.phase !== 'finished', '既に終局しています');
  const p = game.current;
  switch (action.type) {
    case 'open': {
      assert(game.phase === 'opening', '平場ではありません');
      const ids = action.ids || [];
      assert(ids.length === 2, '役は2枚で出してください');
      assert(ids.every(id => game.hands[p].includes(id)) && ids[0] !== ids[1], '手札を2枚選んでください');
      const role = roleOf(game, ids);
      assert(isStronger(role, game.openingRole), '現在の役をレイズできません');
      if (game.board) {
        game.discard.push(...game.board.items.map(item => item.id));
        game.raise++;
        game.lastOverwriter = p;
      }
      const flips = action.flips || [false, false];
      const roots=ids.map((id,i)=>oriented(game,id,Boolean(flips[i])));
      game.board={items:roots,splitIndex:1,ports:initialPorts(roots),chosenSide:null};
      removeHand(game, p, ids);
      game.openingRole = role;
      award(game, p, 'role', role.points);
      award(game, p, 'pips', ids.reduce((s, id) => s + tilePips(getTile(game, id)), 0));
      record(game, `P${p + 1} ${role.name} · +${role.points}役点${game.raise ? ` · ${game.raise}レイズ` : ''}`, p);
      if (checkEndHand(game, p)) break;
      game.current = nextActive(game, p);
      if (game.final && game.current === p) settleOpening(game, other(p));
      break;
    }
    case 'passOpen': {
      assert(game.phase === 'opening', '平場ではありません');
      if (!game.final) {
        assert(game.board, '最初の役は必ず出してください');
        record(game, `P${p + 1} レイズを見送り`, p);
        settleOpening(game, p);
      } else {
        game.finalOut[p] = true;
        record(game, `P${p + 1} 最終平場をパス · 脱落`, p);
        if (game.finalOut.every(Boolean)) finish(game, 'exhaustion');
        else if (game.board) settleOpening(game, p);
        else game.current = other(p);
      }
      break;
    }
    case 'attach': {
      assert(game.phase === 'attachment', '付札フェーズではありません');
      const ids = action.ids || [];
      const candidates = attachmentMoves(game, ids, p);
      const move = candidates.find(x => x.key === action.moveKey);
      assert(move, 'その接続はできません');

      removeHand(game,p,ids);
      const board=game.board,existing=boardPorts(board);
      const port=existing.find(x=>x.key===move.portKey);
      const second=move.portKey2?existing.find(x=>x.key===move.portKey2):null;
      const consumed=new Set([move.portKey,move.portKey2].filter(Boolean));
      // Seal the untouched root after the first ordinary connection.
      board.ports=existing.filter(x=>!consumed.has(x.key)
        && !(board.chosenSide==null&&!move.special&&x.root&&x.key!==port.key));
      if(board.chosenSide==null)board.chosenSide=move.special?'supreme':port.side;
      const add=(v,parentPort)=>{
        board.items.push({...v,parent:parentPort.owner,via:parentPort.key,side:parentPort.side,slot:parentPort.slot});
        board.ports.push(...outgoingPorts(v,parentPort.side));
      };
      add(move.placements[0],port);
      if(move.placements.length===2){
        if(move.special)add(move.placements[1],second);
        else {
          // The second tile consumes the straight-ahead port of the first.
          board.ports=board.ports.filter(x=>x.key!==`tile-${move.placements[0].id}-0`);
          add(move.placements[1],{owner:move.placements[0].id,side:port.side,slot:0,key:`tile-${move.placements[0].id}-0`});
        }
      }
      award(game, p, 'pips', ids.reduce((s, id) => s + tilePips(getTile(game, id)), 0));
      game.passStreak = 0;
      record(game, `P${p + 1} ${ids.length}枚付札${move.special ? ' · 至尊の両側接続' : ''}`, p);
      if (checkEndHand(game, p)) break;
      game.current = nextActive(game, p);
      break;
    }
    case 'passAttach': {
      assert(game.phase === 'attachment', '付札フェーズではありません');
      if (game.final) {
        game.finalOut[p] = true;
        record(game, `P${p + 1} 最終付札をパス · 脱落`, p);
        if (game.finalOut.every(Boolean)) finish(game, 'exhaustion');
        else game.current = other(p);
      } else {
        const drawn = draw(game, p);
        record(game, `P${p + 1} パス · ${drawn ? '1枚ドロー' : '山札なし'}`, p);
        if (game.final) {
          game.current = other(p);
          break;
        }
        game.passStreak++;
        if (game.passStreak >= 2) endRound(game);
        else game.current = other(p);
      }
      break;
    }
    case 'adjust': {
      assert(game.phase === 'adjustment', '手札調整ではありません');
      assert(!game.adjustDone[p], '調整は各自1回です');
      assert(['none', 'draw', 'exchange'].includes(action.choice), '無効な調整方法');
      if (action.choice === 'exchange') {
        const ids = action.ids ?? (action.id == null ? [] : [action.id]);
        assert(Array.isArray(ids) && ids.length >= 1, '交換する牌を1枚以上選択してください');
        assert(new Set(ids).size === ids.length && ids.every(id => game.hands[p].includes(id)), '交換牌に重複または手札外の牌があります');
        // Validate the entire exchange before removing anything. Exchanged tiles
        // go straight to the public discard, never back into the draw pile.
        assert(ids.length <= game.stock.length, `山札は残り${game.stock.length}枚です。交換枚数を減らしてください`);
        removeHand(game, p, ids);
        game.discard.push(...ids);
        for (let k = 0; k < ids.length; k++) draw(game, p);
        record(game, `P${p + 1} ${ids.length}枚公開交換`, p);
      } else if (action.choice === 'draw') {
        assert(game.stock.length > 0, '山札がありません');
        draw(game, p);
        record(game, `P${p + 1} 1枚補充`, p);
      } else record(game, `P${p + 1} 調整なし`, p);
      game.adjustDone[p] = true;
      if (game.final) break;
      if (game.adjustDone.every(Boolean)) startAfterAdjust(game);
      else game.current = other(p);
      break;
    }
    default: throw new Error(`未対応のアクション: ${action.type}`);
  }
  return game;
}
