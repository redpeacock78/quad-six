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
    game.current=0; // Parent is randomly assigned; this fixture stages player 0.
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

test('the board visually renders a perpendicular double with correctly positioned endpoint labels',()=>{
  const {app,game}=fixture();
  assert.match(app.innerHTML,/board-graph/);
  assert.match(app.innerHTML,/<svg/);
  assert.match(app.innerHTML,/width="46" height="72"/);
  for(const number of [1,2,3]) assert.match(app.innerHTML,new RegExp(`端点${number}`));
  assert.match(app.innerHTML,/左（端点1・4）/);
  assert.match(app.innerHTML,/左上（端点2・4）/);
  assert.match(app.innerHTML,/左下（端点3・4）/);
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
  assert.match(app.innerHTML,/左（端点1・4）へ1枚/);
  assert.match(app.innerHTML,/左上（端点2・4）へ1枚/);
  assert.match(app.innerHTML,/左下（端点3・4）へ1枚/);
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

test('nested spinner labels follow rendered positions even when engine directions differ',()=>{
  const {app,ctx,click,game}=fixture();
  const remaining=game.tiles.find(t=>t.a===4 && t.b===4 && game.hands[0].includes(t.id));
  assert.ok(remaining);
  click('select',{id:String(remaining.id)});
  const choice=runInContext(`attachmentMoves(game,[${remaining.id}]).find(m=>m.direction==='up').key`,ctx);
  click('choose-attachment',{key:choice});
  click('attach');
  const born=game.board.ports.filter(p=>p.owner===remaining.id);
  assert.equal(born.map(p=>p.direction).join(','),'up,left,right');
  // All five visually extend left of their parents, regardless of the
  // abstract up/left/right direction labels used by the game engine.
  const graph=app.innerHTML.split('class="board-graph"')[1];
  const screenLabels=[...graph.matchAll(/data-port-label="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(screenLabels.length,5);
  assert.ok(screenLabels.every(label=>label.startsWith('左')),
    'every visible endpoint is on the left side of its owning tile');
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

test('right-side spinner on a logically downward branch is labeled from actual screen geometry',()=>{
  const {app,ctx}=fixture();
  const info=runInContext(`(() => {
    start('local','single');handoff=false;
    const find=k=>game.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
    game.current=0;game.hands[0]=game.tiles.map(t=>t.id);game.hands[1]=[];
    dispatch(game,{type:'open',ids:[find('0-2')[0],find('0-4')[0]]});
    game.current=0;game.phase='attachment';
    const play=(types,predicate)=>{
      const ids=types.map(k=>find(k).find(id=>game.hands[0].includes(id)));
      const move=attachmentMoves(game,ids).find(predicate);
      if(!move)throw Error('missing expected move');
      dispatch(game,{type:'attach',ids,moveKey:move.key});
      game.current=0;game.phase='attachment';
    };
    play(['4-4'],m=>m.side==='right');
    play(['4-5','3-5'],m=>m.direction==='down');
    play(['3-3'],m=>m.direction==='down');
    render();
    const layout=graphLayout(game.board);
    return boardPorts(game.board).map((port,i)=>({
      key:port.key,
      logicalDirection:port.direction,
      screenLabel:formatPort(port,i,layout),
      dx:layout.px(layout.portPositions.get(port.key))-layout.px(layout.positions.get(port.owner)),
      dy:layout.portPositions.get(port.key).y-layout.positions.get(port.owner).y
    }));
  })()`,ctx);
  const three=info.filter(p=>p.screenLabel.endsWith('・3）'));
  assert.equal(three.length,3);
  assert.equal(three.map(p=>p.logicalDirection).join(','),'down,left,right');
  assert.equal(three.map(p=>p.screenLabel.replace(/（.*/, '')).join(','),'右,右上,右下');
  // The physical vector wins over the engine's abstract "down,left,right".
  for (const p of info) {
    assert.ok(p.dx>0,'all staged endpoint markers are right of their owner');
    const expected=p.dy< -20?'右上':p.dy>20?'右下':'右';
    assert.ok(p.screenLabel.startsWith(expected),`wrong visual direction for ${p.key}`);
  }
  const html=app.innerHTML;
  for(const p of three)assert.ok(html.includes(p.screenLabel),
    'candidate and graph marker must share the same display label');
});

test('Supreme opening keeps the right root visible and selectable after attaching left',()=>{
  const {app,ctx,click}=fixture();
  const result=runInContext(`(() => {
    start('local','single');handoff=false;
    const find=k=>game.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
    game.current=0;game.hands[0]=game.tiles.map(t=>t.id);game.hands[1]=[];
    dispatch(game,{type:'open',ids:[find('6-6')[0],find('0-0')[0]]});
    game.current=0;game.phase='attachment';
    const leftId=find('5-6')[0];
    const left=attachmentMoves(game,[leftId]).find(m=>m.portKey==='root-left');
    if(!left)throw Error('left opening should accept [5|6]');
    dispatch(game,{type:'attach',ids:[leftId],moveKey:left.key});
    game.current=0;game.phase='attachment';
    resetTurnSelection();render();
    const right=find('0-3')[0];
    const available=attachmentMoves(game,[right]);
    return {chosen:game.board.chosenSide,
      rightKey:available.find(m=>m.portKey==='root-right')?.key,
      rightId:right,
      stillOpen:boardPorts(game.board).some(p=>p.key==='root-right'),
      rightLabel:formatPort(boardPorts(game.board).find(p=>p.key==='root-right'),
        boardPorts(game.board).findIndex(p=>p.key==='root-right'),graphLayout(game.board))
    };
  })()`,ctx);
  assert.equal(result.chosen,'supreme');
  assert.ok(result.stillOpen);
  assert.ok(result.rightKey,'right root is legal for the other side of Supreme');
  assert.match(app.innerHTML,/至尊：左右両側の起点が有効/);
  assert.match(app.innerHTML,/data-port-key="root-right"/);
  assert.ok(app.innerHTML.includes(result.rightLabel));
  click('select',{id:String(result.rightId)});
  assert.match(app.innerHTML,/至尊の平場は左右両側OK/);
  assert.ok(app.innerHTML.includes(result.rightLabel+'へ1枚'));
  click('choose-attachment',{key:result.rightKey});
  click('attach');
  assert.equal(runInContext('game.board.items.length',ctx),4);
  assert.equal(runInContext('game.board.chosenSide',ctx),'supreme');
});


test('an unplayable pair explicitly shows open values instead of hiding the reason',()=>{
  const {app,ctx}=fixture();
  runInContext(`
    game.board.ports=[{key:'root-left',owner:game.board.items[0].id,pip:1,side:'left',direction:'left',slot:0,root:true}];
    const two=game.tiles.find(t=>tileKey(t)==='2-2').id;
    const twoFour=game.tiles.find(t=>tileKey(t)==='2-4').id;
    selected=[two,twoFour];render();
  `,ctx);
  assert.match(app.innerHTML,/現在の開放数字：1/);
  assert.match(app.innerHTML,/同じ枝へ連続接続/);
  assert.match(app.innerHTML,/選んだ2枚の接続先がない/);
});
