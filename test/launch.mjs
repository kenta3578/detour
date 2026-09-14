// 拡張機能を読み込んだ Chromium を立ち上げる（E2E とストア素材の撮影で共用）。
// 許可ダイアログは自動操作で押せないので、テスト用のコピーでは指定したホストの許可を manifest に書いて最初から与える。
import { chromium } from 'playwright-core';
import { cpSync, readdirSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const app of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(cache, d, app);
      if (existsSync(p)) return p;
    }
  }
  throw new Error('Chromium が見つかりません。CHROMIUM_PATH を指定してください');
}

export async function launchWithExtension({ grantHosts = [], viewport, colorScheme } = {}) {
  const ext = mkdtempSync(join(tmpdir(), 'detour-ext-'));
  for (const name of ['manifest.json', 'src', 'icons']) cpSync(join(root, name), join(ext, name), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions = grantHosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'detour-profile-')), {
    executablePath: findChromium(),
    headless: true,
    viewport,
    colorScheme,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--host-resolver-rules=MAP *.test 127.0.0.1'],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  return { context, sw, extUrl: (path) => `chrome-extension://${extId}/${path}` };
}
