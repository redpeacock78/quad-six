import test from 'node:test';
import assert from 'node:assert/strict';

test('format selection, local handoff and human opening can be rendered', async () => {
  const app = {
    innerHTML: '', listener:null,
    addEventListener(name, handler) { if(name==='click') this.listener=handler; }
  };
  globalThis.document={getElementById:(id)=>id==='app'?app:null};
  globalThis.window={confirm:()=>true};
  await import('../site/ui.js');
  const click=(action, extra={})=>app.listener({target:{closest:()=>({dataset:{action,...extra}})}});
  assert.match(app.innerHTML, /CPUと対戦する/);
  assert.match(app.innerHTML, /東風戦/);
  assert.match(app.innerHTML, /半荘戦/);
  click('select-format',{format:'hanchan'});
  assert.match(app.innerHTML, /aria-pressed="true"[^>]*>半荘戦/);
  click('start-local');
  assert.match(app.innerHTML, /1\/8親番/);
  assert.match(app.innerHTML, /250/);
  assert.match(app.innerHTML, /PASS THE DEVICE/);
  click('reveal');
  assert.match(app.innerHTML, /手札 9枚/);
  const ids=[...app.innerHTML.matchAll(/data-action="select" data-id="(\d+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,9);
  click('select',{id:ids[0]});
  click('select',{id:ids[1]});
  assert.match(app.innerHTML, /役を場に出す/);
  click('open');
  assert.match(app.innerHTML, /PASS THE DEVICE/);
  click('reveal');
  assert.match(app.innerHTML, /上書き/);
  click('passOpen');
  assert.match(app.innerHTML, /付札/);
  click('help');
  assert.match(app.innerHTML, /武牌9種の役表/);
  click('close-help');
});
