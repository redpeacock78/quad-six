import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const modules = ['engine','ai','match','ui'].map(name =>
  readFileSync(new URL(`../site/${name}.js`,import.meta.url),'utf8')
    .replace(/^import\s+[^\n]+\n/gm,'').replace(/^export\s+/gm,'')
).join('\n');

function scene() {
  const app={innerHTML:'',addEventListener(){}};
  const ctx=createContext({
    document:{getElementById:()=>app},
    window:{confirm:()=>true,scrollTo(){}},
    setTimeout:()=>0,clearTimeout(){}
  });
  runInContext(modules,ctx);
  return {app,ctx};
}

test('SVG pips use the same 0–6 dot counts as hand dominoes', () => {
  const {ctx}=scene();
  for(let value=0;value<=6;value++){
    const svg=runInContext(`svgPipHalf(${value}, -20, -23, 40, 46)`,ctx);
    const circles=[...svg.matchAll(/<circle class="board-pip" cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/g)];
    assert.equal(circles.length,value,`value ${value} should have ${value} pips`);
    for(const [,x,y,r] of circles) {
      assert.ok(Number(x)>-20 && Number(x)<20,`value ${value} pip x inside half`);
      assert.ok(Number(y)>-23 && Number(y)<23,`value ${value} pip y inside half`);
      assert.ok(Number(r)>0);
    }
    assert.doesNotMatch(svg,/<text|<span/);
  }
});

test('the opening [0|1] [0|1] shows SVG dots, not numbers on the domino faces', () => {
  const {ctx}=scene();
  const html=runInContext(`(() => {
    start('local','single');handoff=false;
    const ids=game.tiles.filter(t=>tileKey(t)==='0-1').map(t=>t.id);
    game.current=0;game.hands[0]=game.tiles.map(t=>t.id);game.hands[1]=[];
    dispatch(game,{type:'open',ids,flips:[false,false]});
    return boardMarkup();
  })()`,ctx);
  const faces=[...html.matchAll(/<g transform="translate\([^)]+\)" aria-label="([0-6])｜([0-6])">([\s\S]*?)<\/g>/g)];
  assert.equal(faces.length,2);
  assert.deepEqual(faces.map(m=>m[1]+'|'+m[2]),['0|1','0|1']);
  for(const face of faces){
    assert.equal((face[3].match(/class="board-pip"/g)||[]).length,1);
    assert.doesNotMatch(face[3],/<text/,'domino face should not contain numeric text');
  }
});

test('perpendicular double [4|4] has four pips on EACH vertical half', () => {
  const {ctx}=scene();
  const html=runInContext(`(() => {
    start('local','single');handoff=false;
    const find=k=>game.tiles.filter(t=>tileKey(t)===k).map(t=>t.id);
    game.current=0;game.hands[0]=game.tiles.map(t=>t.id);game.hands[1]=[];
    dispatch(game,{type:'open',ids:[find('0-4')[0],find('3-5')[0]],flips:[true,true]});
    game.current=0;game.phase='attachment';
    const double=find('4-4')[0], move=attachmentMoves(game,[double])[0];
    dispatch(game,{type:'attach',ids:[double],moveKey:move.key});
    return boardMarkup();
  })()`,ctx);
  const faces=[...html.matchAll(/<g transform="translate\([^)]+\)" aria-label="4｜4">([\s\S]*?)<\/g>/g)];
  assert.equal(faces.length,1,'one vertical [4|4] tile');
  const face=faces[0][1];
  assert.match(face,/width="46" height="72"/);
  const y=[...face.matchAll(/class="board-pip" cx="[\d.-]+" cy="([\d.-]+)"/g)].map(m=>Number(m[1]));
  assert.equal(y.length,8);
  assert.equal(y.filter(v=>v<0).length,4,'top half has four pips');
  assert.equal(y.filter(v=>v>0).length,4,'bottom half has four pips');
  assert.doesNotMatch(face,/<text/);
});
