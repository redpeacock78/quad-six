import test from 'node:test';
import assert from 'node:assert/strict';

test('ES module import chain and screen initialize correctly', async () => {
  const { chooseAIAction } = await import('../site/ai.js');
  assert.equal(typeof chooseAIAction, 'function');

  const app = {
    innerHTML: '',
    listener: null,
    addEventListener(type, fn) { if (type === 'click') this.listener = fn; }
  };
  globalThis.document = { getElementById: id => id === 'app' ? app : null };
  globalThis.window = { confirm: () => true };
  await import('../site/ui.js');
  assert.match(app.innerHTML, /CPUと対戦する/);
  assert.equal(typeof app.listener, 'function');
});
