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
  assert.equal(game.board.ports.length,3);
});

test('player can explicitly select among all three spinner branches',()=>{
  const {app,ctx,click,game,branchTile}=fixture();
  click('select',{id:String(branchTile)});
  assert.equal((app.innerHTML.match(/data-action="choose-attachment"/g)||[]).length,3);
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
