import { handPairs, isStronger, allAttachmentMoves, getTile, tilePips, tileKey, attachmentMoves, totalScore } from './engine.js?v=port-feedback-20261030f';


/** An intentionally readable starter opponent, not an optimal solver. */
function bidExchangeTiles(game, player) {
  const hand=game.hands[player];
  const counts=new Map();
  for(const id of hand){
    const k=tileKey(getTile(game,id));
    counts.set(k,(counts.get(k)||0)+1);
  }
  // Preserve existing pairs and both Supreme components when possible.
  // At least one tile is replaceable even if the entire hand is protected.
  const loose=hand.filter(id=>{
    const key=tileKey(getTile(game,id));
    return counts.get(key)===1 && key!=='0-0' && key!=='6-6';
  });
  const pool=loose.length?loose:hand;
  const max=Math.min(pool.length,game.stock.length);
  if(!max)return [];
  const count=Math.min(max,Math.max(1,Math.ceil(pool.length*(.45+Math.random()*.45))));
  return [...pool].sort((a,b)=>tilePips(getTile(game,b))-tilePips(getTile(game,a)))
    .slice(0,count);
}

export function chooseAIAction(game) {
  const p = game.current, hand = game.hands[p];
  if (game.phase === 'opening') {
    let candidates = handPairs(game, p, Boolean(game.board));
    // Spend the optional bidding exchange to chase a stronger role.
    // No role can beat Supreme, so exchanging there would only burn stock.
    const canTrade=!game.final&&!game.bidExchanged?.[p]&&game.stock.length>0;
    if (canTrade && game.board && candidates.length===0 &&
        game.openingRole?.tier!=='supreme' && Math.random()<.88) {
      const ids=bidExchangeTiles(game,p);
      if(ids.length)return {type:'bidExchange',ids};
    }
    if (candidates.length === 0) return { type: 'passOpen' };
    if(canTrade && !game.board && candidates.every(c=>c.role.tier==='common') &&
       Math.random()<.35){
      const ids=bidExchangeTiles(game,p);
      if(ids.length)return {type:'bidExchange',ids};
    }
    // Reserve supreme occasionally for the next round when opening the table.
    const tiers = { supreme: 5, civil: 4, martial: 3, common: 1 };
    candidates = candidates.map(c => ({ ...c, value: tiers[c.role.tier] * 15 + c.role.level * .7 + c.ids.reduce((v, id) => v + tilePips(getTile(game, id)), 0) * .2 }));
    if (game.board) {
      candidates.sort((a, b) => a.value - b.value);
      // Cheaper valid overwrite normally wins; occasionally seek power.
      if (game.final || Math.random() > .16) candidates = [candidates[0]];
      else candidates = [candidates[candidates.length - 1]];
    } else {
      candidates.sort((a, b) => b.value - a.value);
      if (candidates[0].role.tier === 'supreme' && Math.random() > .55 && candidates.length > 1) candidates.shift();
    }
    const picked = candidates[0];
    const flips = [false, false];
    return { type: 'open', ids: picked.ids, flips };
  }
  if (game.phase === 'attachment') {
    const options = allAttachmentMoves(game, p);
    if (!options.length) return { type: 'passAttach' };
    const scored = options.map(move => {
      const points = move.placements.reduce((sum, v) => sum + v.a + v.b, 0);
      const endValue = move.endValue;
      const compatible = hand.filter(id => !move.placements.some(v => v.id === id))
        .filter(id => { const t = getTile(game, id); return t.a === endValue || t.b === endValue; }).length;
      return { move, value: move.placements.length * 22 + points * .7 + compatible * 3 + (move.special ? 11 : 0) + move.placements.filter(v=>v.a===v.b).length*3 + Math.random() * 2 };
    });
    scored.sort((a, b) => b.value - a.value);
    const move = scored[0].move;
    return { type: 'attach', ids: move.placements.map(v => v.id), moveKey: move.key };
  }
  if (game.phase === 'adjustment') {
    if (game.stock.length === 0) return null; // Exhaustion already means final play.
    if (hand.length < 3 && Math.random() < .6) return { type: 'adjust', choice: 'draw' };
    if (Math.random() < .65 && hand.length >= 4) {
      const cnt = new Map();
      for (const id of hand) cnt.set(tileKey(getTile(game, id)), (cnt.get(tileKey(getTile(game, id))) || 0) + 1);
      const candidates = hand.filter(id => cnt.get(tileKey(getTile(game, id))) === 1)
        .filter(id => !['0-0', '6-6'].includes(tileKey(getTile(game, id))));
      if (candidates.length) {
        candidates.sort((a, b) => tilePips(getTile(game, b)) - tilePips(getTile(game, a)));
        // Discard some isolated high-pip tiles, preserving duplicate pairs and
        // the supreme components. Never request more tiles than remain in stock.
        const count = Math.min(candidates.length, game.stock.length, 1 + Math.floor(Math.random() * 3));
        if (count > 0) return { type: 'adjust', choice: 'exchange', ids: candidates.slice(0, count) };
      }
    }
    return { type: 'adjust', choice: 'draw' };
  }
  return null;
}
