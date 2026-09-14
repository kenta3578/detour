// Chrome のポリシーを入れる macOS 構成プロファイルを生成する。
//   node scripts/gen-mobileconfig.mjs <拡張機能ID>
// 削除パスワードを付けるときは環境変数 DETOUR_REMOVAL_PASSWORD に入れる（シェル履歴に残さないため引数では受けない）。
// 出力は dist/detour.mobileconfig（パスワードを含みうるので git 管理外）。
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const id = process.argv[2];
if (!/^[a-p]{32}$/.test(id ?? '')) {
  console.error('使い方: node scripts/gen-mobileconfig.mjs <Chrome ウェブストアの拡張機能ID（a〜p の32文字）>');
  process.exit(1);
}
const password = process.env.DETOUR_REMOVAL_PASSWORD ?? '';

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const chromePayload = `
    <dict>
      <key>PayloadType</key><string>com.google.Chrome</string>
      <key>PayloadIdentifier</key><string>local.detour.chrome</string>
      <key>PayloadUUID</key><string>${randomUUID()}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadDisplayName</key><string>Chrome: Detour を外せなくする</string>
      <key>ExtensionInstallForcelist</key>
      <array><string>${id};https://clients2.google.com/service/update2/crx</string></array>
      <key>IncognitoModeAvailability</key><integer>1</integer>
      <key>BrowserGuestModeEnabled</key><false/>
      <key>BrowserAddPersonEnabled</key><false/>
    </dict>`;

const removalPayload = password
  ? `
    <dict>
      <key>PayloadType</key><string>com.apple.profileRemovalPassword</string>
      <key>PayloadIdentifier</key><string>local.detour.removal-password</string>
      <key>PayloadUUID</key><string>${randomUUID()}</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>RemovalPassword</key><string>${xml(password)}</string>
    </dict>`
  : '';

const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>${chromePayload}${removalPayload}
  </array>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadIdentifier</key><string>local.detour</string>
  <key>PayloadUUID</key><string>${randomUUID()}</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadScope</key><string>System</string>
  <key>PayloadDisplayName</key><string>Detour</string>
  <key>PayloadDescription</key><string>Detour 拡張機能を強制インストールし、シークレット・ゲスト・プロファイル追加を止める</string>
</dict>
</plist>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'detour.mobileconfig');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, profile, { mode: 0o600 });
console.log(`${out} を書きました${password ? '（削除パスワード付き）' : ''}`);
