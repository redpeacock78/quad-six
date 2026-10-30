import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=['engine','ai','match','ui'].map(name=>
  readFileSync(new URL(`../site/${name}.js`,import.meta.url),'utf8')
    .replace(/^import\s+[^\n]+\n/gm,'').replace(/^export\s+/gm,'')
).join('\n');

function fixture(limit=null){
  const app={innerHTML:'',listener:null,addEventListener(_,fn){this.listener=fn;}};
  const ctx=createContext({document:{getElementById:()=>app},
    window:{confirm:()=>true,scrollTo(){}},setTimeout:()=>0,clearTimeout(){}});
  runInContext(source,ctx);
  runInContext(`
    start('local','single');handoff=false;game.current=0;
    ${limit===null?'':`game.stock=game.stock.slice(0,${limit});`}
    resetTurnSelection();render();
    globalThis.fixtureGame=game;
    globalThis.fixtureHand=[...game.hands[0]];
  `,ctx);
  const click=(action,other={})=>app.listener({target:{
    closest:()=>({dataset:{action,...other}})
  }});
  return {app,ctx,click,game:ctx.fixtureGame,hand:ctx.fixtureHand};
}

test('bidding mode selects entire hand, exchanges, and returns to bidding on same turn',()=>{
  const {app,ctx,click,game,hand}=fixture();
  assert.match(app.innerHTML,/競り中に手札交換（残り1回）/);
  assert.match(app.innerHTML,/選択 0 \/ 2/);
  click('opening-exchange-mode');
  assert.match(app.innerHTML,/競り中の手札交換/);
  assert.match(app.innerHTML,/選択 0 \/ 9/);
  click('select-all-exchange');
  assert.match(app.innerHTML,/選択 9 \/ 9/);
  assert.match(app.innerHTML,/選んだ9枚を競り中に交換/);
  click('bid-exchange');
  assert.equal(game.hands[0].length,9);
  assert.ok(game.hands[0].every(id=>!hand.includes(id)));
  assert.equal(game.current,0);
  assert.equal(game.bidExchanged[0],true);
  assert.match(app.innerHTML,/選択 0 \/ 2/);
  assert.match(app.innerHTML,/競り中交換は使用済み/);
  assert.doesNotMatch(app.innerHTML,/data-action="opening-exchange-mode"/);
  for(const id of game.hands[0].slice(0,2))click('select',{id:String(id)});
  click('open');
  assert.ok(game.board);
  assert.equal(game.current,1);
});

test('exchange selection is capped by remaining stock, and cancel restores bid selection',()=>{
  const {app,click,game,hand}=fixture(2);
  click('opening-exchange-mode');
  assert.match(app.innerHTML,/選択 0 \/ 2/);
  assert.match(app.innerHTML,/最大2枚を選択/);
  click('select-all-exchange');
  click('select',{id:String(hand[2])});
  assert.match(app.innerHTML,/選択 2 \/ 2/);
  click('opening-exchange-mode');
  assert.match(app.innerHTML,/選択 0 \/ 2/);
  assert.match(app.innerHTML,/data-action="open"/);
  assert.equal(game.bidExchanged[0],false);
  click('opening-exchange-mode');
  click('select-all-exchange');
  click('bid-exchange');
  assert.equal(game.stock.length,0);
  assert.equal(game.final,true);
  assert.equal(game.current,0);
  assert.match(app.innerHTML,/山札なし/);
});

test('inter-round panel has no skip action, and help explains mandatory adjustment',()=>{
  const {app,ctx,game}=fixture();
  runInContext(`game.phase='adjustment';game.current=0;resetTurnSelection();render()`,ctx);
  assert.doesNotMatch(app.innerHTML,/data-action="adjust-none"/);
  assert.match(app.innerHTML,/1枚ドローか、1〜手札全部の公開交換が必須/);
  const rules=runInContext('helpMarkup()',ctx);
  assert.match(rules,/HOW TO PLAY · VER 0.6/);
  assert.match(rules,/競り中に手札1〜全枚数を公開交換/);
  assert.match(rules,/局間は1枚ドローまたは手札1〜全枚数の公開交換が必須/);
});
