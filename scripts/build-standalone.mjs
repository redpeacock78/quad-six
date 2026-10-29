import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const site = resolve('site');
let html = await readFile(resolve(site, 'index.html'), 'utf8');
const css = await readFile(resolve(site, 'style.css'), 'utf8');

const modules = [];
for (const name of ['engine', 'ai', 'match', 'ui']) {
  let js = await readFile(resolve(site, `${name}.js`), 'utf8');
  js = js.replace(/^import\s+[^\n]+\n/gm, '').replace(/^export\s+/gm, '');
  modules.push(`// ---- ${name}.js ----\n${js}`);
}

html = html.replace(/\s*<link rel="icon"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, `\n<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="\.\/ui\.js"><\/script>/,
    `<script type="module">\n${modules.join('\n')}\n</script>`);

if (!html.includes('function createMatch(') || !html.includes('function advanceGame(')) {
  throw new Error('Standalone bundle is missing match logic');
}
await writeFile(resolve(site, 'standalone.html'), html);
console.log('Built site/standalone.html');
