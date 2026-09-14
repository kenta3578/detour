// CSS の変数は未定義でも例外にならず、既定値のまま静かに描画される。定義漏れをテキストで検査する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const base = readFileSync(join(src, 'style.css'), 'utf8');
const defs = (css) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const darkStart = base.indexOf('@media (prefers-color-scheme: dark)');
const light = defs(base.slice(0, darkStart));
const dark = defs(base.slice(darkStart, base.indexOf('\n}\n', darkStart)));

test('各 CSS で使っている変数はすべて style.css の :root に定義されている', () => {
  for (const file of readdirSync(src).filter((f) => f.endsWith('.css'))) {
    const used = [...readFileSync(join(src, file), 'utf8').matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    const missing = [...new Set(used)].filter((v) => !light.has(v));
    assert.deepEqual(missing, [], `${file} で未定義: ${missing.join(', ')}`);
  }
});

test('ダークモードは、ライトで定義した色のトークンをすべて上書きしている', () => {
  const colors = [...light].filter((v) => !v.startsWith('--radius'));
  const missing = colors.filter((v) => !dark.has(v));
  assert.deepEqual(missing, [], `ダークで未定義: ${missing.join(', ')}`);
});

test('HTML は共通の style.css を読み込んでから画面ごとの CSS を読む', () => {
  for (const file of readdirSync(src).filter((f) => f.endsWith('.html'))) {
    const links = [...readFileSync(join(src, file), 'utf8').matchAll(/href="([a-z-]+\.css)"/g)].map((m) => m[1]);
    assert.equal(links[0], 'style.css', `${file} の最初の stylesheet が style.css ではない`);
  }
});
