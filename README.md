# Detour

登録したドメイン・URL を開こうとすると、指定した URL へ迂回させる Chrome 拡張（Manifest V3）。
ブロックを強める操作はすぐ反映し、弱める操作には手間をかけさせる。

## 挙動

| 操作 | 反映 |
|---|---|
| サイトの追加・今すぐロック | すぐ |
| サイトの削除・リダイレクト先の変更（2回目以降）・一時解除 | 解除フローを通したときだけ |

解除フロー:

- 30 分待つ。タブを前面に出してフォーカスしたまま。離れると最初からやり直し（判定は service worker 側）
- 理由を 100 文字以上書く（貼り付け不可）
- 一時解除は 15 分で自動的にロックへ戻り、そのとき開いているタブも迂回させる
- 実行した操作と理由は設定画面に記録が残る

値は `src/config.js`。

### 登録の書き方

| 入力 | 一致する URL |
|---|---|
| `youtube.com` | `youtube.com` とそのサブドメインすべて |
| `youtube.com/shorts/*` | パスの前方一致。`*` は任意の文字列 |

通常のページ遷移は `declarativeNetRequest` で迂回し、SPA の `pushState` や戻る/進むのキャッシュ復元は `webNavigation` で拾う。iframe での埋め込みはブロックだけする。

## 入れ方

1. `chrome://extensions` でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」でこのディレクトリを選ぶ
2. 拡張機能のアイコンを押して設定画面を開き、リダイレクト先とサイトを登録する
3. 拡張機能の詳細で「シークレット モードでの実行を許可」をオンにする

この入れ方だと `chrome://extensions` からオフにできる。

## 外せなくする

macOS で Chrome ウェブストア外の拡張機能を強制インストールできるのは、MDM 管理下か Chrome Enterprise Core 登録済みの端末だけ。個人の Mac ではウェブストアに**限定公開**して、そのIDをポリシーで強制インストールする。

1. `scripts/pack.sh` で `dist/detour-<version>.zip` を作り、Chrome ウェブストアのデベロッパーダッシュボードに「限定公開（Unlisted）」で提出する
2. 審査が通ったら拡張機能IDで構成プロファイルを作る
   ```sh
   node scripts/gen-mobileconfig.mjs <拡張機能ID>
   # 削除パスワードを付けるなら、パスワードを決める人が入力する
   read -s DETOUR_REMOVAL_PASSWORD && export DETOUR_REMOVAL_PASSWORD && node scripts/gen-mobileconfig.mjs <拡張機能ID>
   ```
3. `dist/detour.mobileconfig` をダブルクリックし、システム設定 → 一般 → デバイス管理 でインストールする
4. Chrome を再起動し、`chrome://policy` で各ポリシーが OK になっていること、`chrome://extensions` で Detour のスイッチがグレーアウトしていることを確かめる
5. 読み込み済みの開発版 Detour は削除する（同じ機能が2つ動くため）

入るポリシー:

| ポリシー | 効果 |
|---|---|
| `ExtensionInstallForcelist` | Detour をオフにも削除もできなくする。強制インストールした拡張機能のページでは、既定で DevTools も開けない |
| `IncognitoModeAvailability: 1` | シークレットモードを使えなくする（強制インストールはシークレットに効かないため） |
| `BrowserGuestModeEnabled: false` | ゲストモードを使えなくする |
| `BrowserAddPersonEnabled: false` | プロファイルを増やせなくする（既存のプロファイルは残るので先に消しておく） |

この構成でも残る抜け道: 管理者権限でのプロファイル削除、Chrome 以外のブラウザ（Safari・Arc・Brave など）、スマートフォン。

## テスト

```sh
npm test          # 照合と解除フローの判定
npm run test:e2e  # 拡張機能を読み込んだ Chromium で迂回を確かめる（Playwright のキャッシュの Chromium を使う。CHROMIUM_PATH で上書き可）
```
