import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=['engine','ai','match','ui'].map(name=>
  readFileSync(new URL(`../site/${name}.js`,import.meta.url),'utf8')
    .replace(/^import\s+[^\n]+\n/gm,'').replace(/^export\s+/gm,'')
).join('\n');
test('final bidding and attachment panels explain alternating turns without elimination',()=>{
  const app={innerHTML:'',addEventListener(){}};
  const ctx=createContext({document:{getElementById:()=>app},window:{confirm:()=>true,scrollTo(){}},
    setTimeout:()=>0,clearTimeout(){}});
  runInContext(source,ctx);
  runInContext(`
    start('local','single');handoff=false;
    game.current=0;game.final=true;game.stock=[];
    const ids=game.hands[0].slice(0,2);
    dispatch(game,{type:'open',ids});
    game.current=1;render();
  `,ctx);
  assert.match(app.innerHTML,/レイズ見送り後も付札に参加/);
  assert.match(app.innerHTML,/レイズを見送って付札へ/);
  assert.doesNotMatch(app.innerHTML,/パスして脱落/);
  runInContext('dispatch(game,{type:"passOpen"});render()',ctx);
  assert.match(app.innerHTML,/山札なし：両者連続パスで精算/);
  assert.match(app.innerHTML,/パス · ドローなし/);
  assert.doesNotMatch(app.innerHTML,/パスで脱落/);
  assert.match(runInContext('helpMarkup()',ctx),/両者の連続パスで精算/);
});
