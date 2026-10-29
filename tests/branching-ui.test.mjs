import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source=['engine','ai','match','ui'].map(name=>
  readFileSync(new URL(`../site/${name}.js`,import.meta.url),'utf8')
    .replace(/^import\s+[^\n]+\n/gm,'').replace(/^export\s+/gm,'')
).join('\n');

function fixture() {
  const app={innerHTML:'',listener:null,addEventListener(type,cb){if(type==='click')this.listener=cb}};
  const ctx=createContext({ document:{getElementById:()=>app},
    window:{confirm:()=>true,scrollTo(){}},setTimeout:()=>0,clearTimeout(){} });
  runInContext(source,ctx);
  runInContext(`
    start('local','tonpu');handoff=false;
    const find = k => game.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
    game.hands[0]=game.tiles.map(t=>t.id);
    game.hands[1]=[];
    dispatch(game,{type:'open',ids:[find('0-4')[0],find('3-5')[0]],flips:[true,true]});
    game.current=0;game.phase='attachment';
    const dbl=find('4-4')[0];
    const move=attachmentMoves(game,[dbl])[0];
    dispatch(game,{type:'attach',ids:[dbl],moveKey:move.key});
    game.current=0;game.phase='attachment';resetTurnSelection();render();
    globalThis.fixtureGame=game;
    globalThis.fixtureBranchTile=find('2-4')[0];
  `,ctx);
  const click=(action,other={})=>app.listener({target:{
    closest:()=>({dataset:{action,...other}})
  }});
  return {app,ctx,click,game:ctx.fixtureGame,branchTile:ctx.fixtureBranchTile};
}

test('the board visually renders a perpendicular double with three numbered open ends',()=>{
  const {app,game}=fixture();
  assert.match(app.innerHTML,/board-graph/);
  assert.match(app.innerHTML,/<svg/);
  assert.match(app.innerHTML,/width="46" height="72"/);
  for(const number of [1,2,3]) assert.match(app.innerHTML,new RegExp(`端点${number}`));
  assert.match(app.innerHTML,/左端（端点1・4）/);
  assert.match(app.innerHTML,/上端（端点2・4）/);
  assert.match(app.innerHTML,/下端（端点3・4）/);
  assert.equal(game.board.ports.length,3);
  const graph=app.innerHTML.split('class="board-graph"')[1];
  assert.ok(graph, 'graph section must exist');
  const vb=graph.match(/<svg[^>]*viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(vb, 'graph must have a valid SVG viewport');
  const width=Number(vb[1]),height=Number(vb[2]);
  const markers=[...app.innerHTML.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="24"/g)];
  assert.equal(markers.length,3);
  for(const marker of markers) {
    assert.ok(Number(marker[1])>=24 && Number(marker[1])<=width-24,
      'an open port must not fall outside the horizontal viewport');
    assert.ok(Number(marker[2])>=24 && Number(marker[2])<=height-24,
      'an open port must not fall outside the vertical viewport');
  }
});

test('player can explicitly select among all three spinner branches',()=>{
  const {app,ctx,click,game,branchTile}=fixture();
  click('select',{id:String(branchTile)});
  assert.equal((app.innerHTML.match(/data-action="choose-attachment"/g)||[]).length,3);
  assert.match(app.innerHTML,/左端（端点1・4）へ1枚/);
  assert.match(app.innerHTML,/上端（端点2・4）へ1枚/);
  assert.match(app.innerHTML,/下端（端点3・4）へ1枚/);
  assert.match(app.innerHTML,/data-action="attach" disabled/);
  const keys=game.board.ports.map(p=>p.key);
  const desiredKey=keys[2];
  const chosen=runInContext(`attachmentMoves(game,[${branchTile}]).find(m=>m.portKey===${JSON.stringify(desiredKey)}).key`,ctx);
  click('choose-attachment',{key:chosen});
  assert.equal(game.hands[0].includes(branchTile),true);
  assert.match(app.innerHTML,/move-option chosen/);
  click('attach');
  assert.equal(game.hands[0].includes(branchTile),false);
  assert.equal(game.board.ports.length,3);
  assert.match(app.innerHTML,/board-graph/);
});

test('a spinner connected to the upper branch carries up/left/right direction labels',()=>{
  const {app,ctx,click,game}=fixture();
  const remaining=game.tiles.find(t=>tileKey(t)==='4-4' && game.hands[0].includes(t.id));
  assert.ok(remaining);
  click('select',{id:String(remaining.id)});
  const choice=runInContext(`attachmentMoves(game,[${remaining.id}]).find(m=>m.direction==='up').key`,ctx);
  click('choose-attachment',{key:choice});
  click('attach');
  const born=game.board.ports.filter(p=>p.owner===remaining.id);
  assert.equal(born.map(p=>p.direction).join(','),'up,left,right');
  assert.ok(app.innerHTML.includes('上端（端点'));
  assert.ok(app.innerHTML.includes('左端（端点'));
  assert.ok(app.innerHTML.includes('右端（端点'));
});

test('the historical 6-2-2-0-3-3 screenshot is a LEFT branch and never a false right-side connection',()=>{
  const {app,ctx}=fixture();
  const outcome=runInContext(`
    (() => {
    start('local','single');handoff=false;
    const find = k => game.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
    const roots=find('2-6');
    const ua=find('2-2')[0],ub=find('0-2')[0],ca=find('0-3')[0],cb=find('3-3')[0];
    game.current=1;game.hands[1]=[...roots,ca,cb,find('5-6')[0]];
    game.hands[0]=[ua,ub,find('1-5')[0]];
    dispatch(game,{type:'open',ids:roots});
    game.current=0;dispatch(game,{type:'passOpen'});
    const mine=attachmentMoves(game,[ua,ub]).find(m=>m.portKey==='root-left');
    if(!mine)throw Error('left 2-2 and 2-0 path unexpectedly illegal');
    dispatch(game,{type:'attach',ids:[ua,ub],moveKey:mine.key});
    game.current=1;
    const theirs=attachmentMoves(game,[ca,cb]).find(m=>m.placements[0].a===0);
    if(!theirs)throw Error('0-3 and 3-3 continuation unexpectedly illegal');
    dispatch(game,{type:'attach',ids:[ca,cb],moveKey:theirs.key});
    game.current=0;game.phase='attachment';render();
    return {
      scores:[game.scores[0].pips,game.scores[1].role+game.scores[1].pips],
      items:game.board.items.map(t=>({a:t.a,b:t.b,parent:t.parent})),
      side:game.board.chosenSide
    };
    })();
  `,ctx);
  assert.equal(outcome.scores.join(','),'6,40');
  assert.equal(outcome.side,'left');
  assert.equal(outcome.items.length,6);
  const html=app.innerHTML;
  assert.match(html,/class="board-graph"/);
  assert.doesNotMatch(html,/class="board-strip"/);
  const graph=html.split('class="board-graph"')[1];
  const positioned=[...graph.matchAll(/transform="translate\(([\d.]+) ([\d.]+)\)" aria-label="(\d+)｜(\d+)"/g)]
    .map(match=>({x:Number(match[1]),a:Number(match[3]),b:Number(match[4])}));
  assert.equal(positioned.length,6);
  assert.equal(positioned[0].a,2);
  assert.equal(positioned[0].b,6);
  assert.ok(positioned[1].x>positioned[0].x,'other opening tile is to the right');
  for(const placed of positioned.slice(2))
    assert.ok(placed.x<positioned[0].x,'left-attached tile must render LEFT of left root');
  // Orientation shown on the left must be mirrored from engine order.
  assert.deepEqual(positioned.slice(2).map(t=>[t.a,t.b]),[[2,2],[0,2],[3,0],[3,3]]);
});
