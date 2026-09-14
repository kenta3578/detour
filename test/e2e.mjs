// 拡張機能を読み込んだ Chromium で、迂回・SPA 遷移・開いているタブ・許可なしのブロック・解除フローの拒否を確かめる。
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { launchWithExtension } from './launch.mjs';

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<title>${req.headers.host}${req.url}</title><p>${req.url}</p>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = (host, path = '/') => `http://${host}:${port}${path}`;

// noperm.test だけアクセス許可を与えない
const { context, sw, extUrl } = await launchWithExtension({ grantHosts: ['blocked.test', 'spa.test'] });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);
  }
}

try {
  const options = await context.newPage();
  await options.goto(extUrl('src/options.html'));
  const send = (msg) => options.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const waitRules = async (n) => {
    for (let i = 0; i < 50; i++) {
      if ((await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length === n) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`ルール数が ${n} になりません`);
  };

  const safe = url('safe.test', '/ok');
  assert.deepEqual(await send({ type: 'setRedirect', url: safe }), {});
  for (const p of ['blocked.test', 'spa.test/shorts/*', 'noperm.test']) {
    assert.equal((await send({ type: 'add', pattern: p })).pattern, p);
  }
  await waitRules(6);

  const page = await context.newPage();

  await step('登録ドメイン（サブドメイン含む）はリダイレクト先へ迂回する', async () => {
    await page.goto(url('sub.blocked.test', '/watch'));
    await page.waitForURL(safe, { timeout: 5000 });
  });

  await step('パスが一致しなければ通す', async () => {
    await page.goto(url('spa.test', '/home'));
    assert.equal(page.url(), url('spa.test', '/home'));
  });

  await step('SPA の pushState で一致するパスに移ったら迂回する', async () => {
    await page.evaluate(() => history.pushState({}, '', '/shorts/abc'));
    await page.waitForURL(safe, { timeout: 5000 });
  });

  await step('アクセス許可のないサイトは迂回せずブロックする', async () => {
    const st = await send({ type: 'getState' });
    assert.equal(st.patterns.find((p) => p.pattern === 'noperm.test').granted, false);
    await assert.rejects(page.goto(url('noperm.test', '/')), /ERR_BLOCKED_BY_CLIENT/);
  });

  await step('弱める操作は解除フローを通さないと拒否される', async () => {
    assert.match((await send({ type: 'setRedirect', url: url('other.test') })).error, /解除フロー/);
    assert.match((await send({ type: 'remove', pattern: 'blocked.test' })).error, /不明/);
    await send({ type: 'gateStart', action: { type: 'unlock' } });
    assert.match((await send({ type: 'gateComplete', reason: 'あ'.repeat(120) })).error, /待ち時間/);
    await send({ type: 'gateCancel' });
  });

  await step('リダイレクト先に一致するパターンは登録できない', async () => {
    assert.match((await send({ type: 'add', pattern: 'safe.test' })).error, /リダイレクト先/);
  });

  await step('ロックに戻った時点で開いているタブを迂回させる', async () => {
    await sw.evaluate(() => chrome.storage.local.set({ unlockUntil: Date.now() + 60_000 }));
    await waitRules(0);
    await page.goto(url('blocked.test', '/during-unlock'));
    assert.equal(page.url(), url('blocked.test', '/during-unlock'));
    await send({ type: 'lockNow' });
    await page.waitForURL(safe, { timeout: 5000 });
  });
} finally {
  await context.close();
  server.close();
}

console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
