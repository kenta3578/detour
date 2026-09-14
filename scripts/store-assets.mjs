// Chrome ウェブストアに載せるスクリーンショット（1280x800）と小さいプロモタイル（440x280）を dist/store/ に撮る。
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchWithExtension, root } from '../test/launch.mjs';

const out = join(root, 'dist', 'store');
mkdirSync(out, { recursive: true });

const { context, extUrl } = await launchWithExtension({
  grantHosts: ['youtube.com', 'x.com'],
  viewport: { width: 1280, height: 800 },
});

const zoom = (page) => page.evaluate(() => (document.body.style.zoom = '1.35'));

try {
  const page = await context.newPage();
  await page.goto(extUrl('src/options.html'));
  const send = (msg) => page.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  await send({ type: 'setRedirect', url: 'https://example.org/focus' });
  for (const p of ['youtube.com', 'x.com', 'news.example.com']) await send({ type: 'add', pattern: p });
  await page.evaluate(() =>
    chrome.storage.local.set({
      log: [{ at: Date.now() - 86_400_000, action: { type: 'unlock' }, reason: '明日の発表で引用する動画のタイムスタンプを確認するため。' }],
    }),
  );
  await page.reload();
  await zoom(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'screenshot-1-options.png') });

  await page.goto(extUrl('src/gate.html') + '#' + encodeURIComponent(JSON.stringify({ type: 'unlock' })));
  await zoom(page);
  await page.fill('#reason', '調べものの途中で、参考になりそうな解説動画を一本だけ見たい。');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, 'screenshot-2-gate.png') });

  const icon = readFileSync(join(root, 'icons', 'icon128.png')).toString('base64');
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`
    <body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:24px;padding:0 36px;box-sizing:border-box;
      background:#fafafa;font-family:system-ui,-apple-system,'Hiragino Sans',sans-serif;color:#1c1c1e">
      <img src="data:image/png;base64,${icon}" width="96" height="96">
      <div>
        <div style="font-size:34px;font-weight:700">Detour</div>
        <div style="font-size:17px;line-height:1.5;margin-top:6px">つい開くサイトを迂回させる。<br>解除には 30 分と理由がいる。</div>
      </div>
    </body>`);
  await page.screenshot({ path: join(out, 'promo-small-440x280.png') });
} finally {
  await context.close();
}
console.log(`${out} に書きました`);
