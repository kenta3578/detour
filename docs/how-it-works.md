# 仕組み

Detour は2つの層でできている。

| 層 | 担当 | 場所 |
|---|---|---|
| 迂回させる | 登録したサイトを開いたら指定の URL へ飛ばし、弱める操作に手間をかけさせる | 拡張機能のコード（`src/`） |
| 外させない | その拡張機能をオフにも削除もできなくする | macOS の構成プロファイル（`scripts/gen-mobileconfig.mjs`） |

上の層だけでは `chrome://extensions` から1クリックで無効にできてしまう。自分で鍵を持っているブロックは機能しないので、下の層が要る。

## 迂回させる層

### ルールの持ち方

登録したサイト（`patterns`）・リダイレクト先（`redirectUrl`）・一時解除の期限（`unlockUntil`）・操作の記録（`log`）を `chrome.storage.local` に置く。この内容が変わるたびに `apply()`（`src/background.js`）が動的ルールを丸ごと作り直す。ルールは `declarativeNetRequest` の dynamic rules として Chrome 側に登録されるので、判定は拡張機能の JS ではなくブラウザのネットワーク層で行われる。

一時解除中はルールを空にし、`chrome.alarms` で期限にロックへ戻す。ロックへ戻る瞬間に、開いたままのタブも `sweepTabs()` が迂回させる。

### 拾えない遷移を補う

`declarativeNetRequest` はネットワークリクエストを伴う遷移しか見られない。SPA の `pushState` や、戻る/進むでのページ復元はリクエストが出ないため素通しになる。これをタブの URL 変化（`chrome.tabs.onUpdated`）で拾い直し、一致したらその場で飛ばす。

### 権限の取り方

全サイトへのアクセス権は要求しない。サイトを登録したときに、そのサイトとサブドメインの分だけ `optional_host_permissions` を求める。

- 許可がある → 指定の URL へ**迂回**する
- 許可がない → 迂回先へ飛ばせないので**ブロック**にフォールバックする

ブロックは対象サイトへのアクセス権なしで効くので、あとから許可を取り消しても素通しにはならない。強い権限を求めないための作りだが、審査を通しやすくする意味もある。

### 弱める操作を遅くする

強める操作（サイトの追加・今すぐロック）はそのまま通す。弱める操作（削除・リダイレクト先の変更・一時解除）は解除フローを通ったときだけ通す。判定は `src/gate-logic.js` にあり、状態は service worker 側が持つ。画面側の JS を止めても、状態は画面側にないので進まない。

- 30 分待つ。待機ページは一定間隔で service worker に鼓動（beat）を送り、間隔が空いたら `interrupted` として最初から数え直す。タブを閉じる・裏に回す・別のアプリを見る、のどれでもやり直しになる
- 理由を 100 文字以上書く。貼り付けは受け付けない
- 一時解除は 15 分で自動的にロックへ戻る
- 通った操作と理由は記録に残る

値はすべて `src/config.js` にある。

## 外させない層

### 何が何を読んでいるか

```
構成プロファイル（.mobileconfig）
  ↓ システム設定でインストール（管理者パスワードが要る）
/Library/Managed Preferences/com.google.Chrome.plist   ← root 所有。ユーザー権限では書けない
  ↓ Chrome が起動時に「管理されたポリシー」として読む
Chrome のポリシー（chrome://policy で確認できる）
  ↓
拡張機能が location=EXTERNAL_POLICY_DOWNLOAD として入る
  → UI からオフにも削除もできない（スイッチがグレーアウトし、削除ボタンが消える）
```

ポリシー由来で入った拡張機能を利用者が外せないのは Chrome の仕様で、Detour 側のコードは関与しない。強制インストールされた拡張機能のページは、既定で DevTools からも触れない。

macOS でウェブストア**外**の拡張機能を強制インストールできるのは MDM 管理下か Chrome Enterprise Core 登録済みの端末だけなので、個人の Mac では拡張機能をウェブストアに限定公開（Unlisted）し、その ID をポリシーで指定する。`ExtensionInstallForcelist` の値は `<拡張機能ID>;https://clients2.google.com/service/update2/crx` の形で、更新もウェブストア経由で自動的に届く。

### 4つのポリシーがそれぞれ塞ぐもの

| ポリシー | 塞ぐ抜け道 |
|---|---|
| `ExtensionInstallForcelist` | 拡張機能をオフにする・削除する |
| `IncognitoModeAvailability: 1` | シークレットウィンドウで開く（強制インストールした拡張機能はシークレットに効かない） |
| `BrowserGuestModeEnabled: false` | ゲストウィンドウで開く |
| `BrowserAddPersonEnabled: false` | 新しいプロファイルを作って、そこで開く |

### プロファイル削除のパスワード

構成プロファイル自体はシステム設定から削除できる。`DETOUR_REMOVAL_PASSWORD` を入れて生成すると、削除時にパスワードを尋ねる payload（`com.apple.profileRemovalPassword`）が付く。パスワードを決める人と、ブロックされる人を別にするための仕組みで、自分で決めたパスワードでは意味をなさない。

## 効いているかの確かめ方

| 見るもの | 期待する状態 |
|---|---|
| `chrome://policy` | 4つのポリシーが「OK」 |
| `defaults read "/Library/Managed Preferences/com.google.Chrome"` | 4つのポリシーが入っている |
| `chrome://extensions` | Detour のスイッチがグレーアウトし、削除ボタンがない |
| ⌘+Shift+N | シークレットウィンドウが開かない |
| プロファイルの `Secure Preferences` | 拡張機能の `location` が `7`（＝ポリシー由来） |

## この構成でも残るもの

- **管理者権限**。管理者のアカウントを使える限り、構成プロファイルごと外せる。塞ぐには普段使うアカウントを標準ユーザーにして、管理者のパスワードを別の人が持つ必要がある
- **プロファイルごとの設定**。登録したサイトの一覧は Chrome のプロファイルごとに別なので、既存の別プロファイルに切り替えると一覧が空の状態になる。プロファイルは1つに整理するか、すべてに同じ一覧を登録する（`BrowserAddPersonEnabled` が止めるのは新規作成だけで、既存は残る）
- **Chrome 以外**。Safari・Arc・Brave などには効かない
- **スマートフォン**。拡張機能の外
