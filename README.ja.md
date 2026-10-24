# LIVEFolio

[English](README.md)

LIVEFolio は、参戦したライブを記録して振り返るアプリです。iOS・Android・Web（PWA）で動き、データはすべて端末の中に保存されます。

## 主な機能

- **ライブの記録**：ワンマン・フェス・対バンに対応し、写真・会場・セットリストも残せます
- **ホーム**：次のライブまでのカウントダウン、これまでの参戦数、最近のライブ、参戦カレンダーへの入口
- **統計**：ライブ・アーティスト・会場・曲のランキングを年別にも表示し、前年比の順位変動も出します
- **カレンダー**：ライブに行った日の年間ヒートマップと、月別・曜日別のグラフ
- **リキャップ**：1年をストーリー形式で振り返ります
- **アーティスト詳細**：参戦回数、はじまりのライブ、年ごとの参戦数、よく聴いた曲
- **検索**：アーティスト名・公演名・会場から探せます
- **アートワーク**：アーティスト写真と曲のジャケットを自動で取得します（Spotify / iTunes）
- **バックアップ**：JSON へのエクスポートと、JSON・CSV からのインポート

## インストール

### Web 版（PWA）

公開サイト（GitHub Pages の場合 `https://<ユーザー名>.github.io/LIVEFolio/`）をブラウザで開きます。iPhone の Safari では「ホーム画面に追加」、Chrome では「アプリをインストール」を選ぶと、アプリと同じように使えます。

### Android

[Releases](../../releases) から APK をダウンロードしてインストールしてください。「提供元不明のアプリ」のインストールを許可する必要がある場合があります。

### iOS

配布用のビルドはありません。下の手順でソースからビルドし、Xcode でインストールしてください。無料の Apple アカウントでも、自分の iPhone で 7 日間ずつ使えます。

## ソースからビルドする

必要なもの：Node.js 20.19 以上（22 推奨）。ネイティブアプリには Android Studio（JDK 21）または Xcode 16 以上も必要です。

```bash
git clone https://github.com/Ryuto42/LIVEFolio.git
cd LIVEFolio
npm ci
```

| やりたいこと | コマンド |
|---|---|
| ブラウザで開発する | `npm run dev` → http://localhost:5173 |
| Web 版をビルドする | `npm run build`（`dist/` に出力） |
| 本番ビルドを確認する（PWA はここで動く） | `npm run preview` |
| ネイティブプロジェクトへ反映する | `npm run build && npx cap sync` |
| Android Studio / Xcode で開く | `npx cap open android` / `npx cap open ios` |

自分のビルドを配布する場合は、`capacitor.config.json`・`android/app/build.gradle`・Xcode プロジェクトにあるアプリ ID（`jp.ryuto.livefolio`）を変更し、Xcode の署名チームも自分のものに設定してください。

### Web 版を公開する

`dist/` は静的なシングルページアプリです。どのパスにアクセスしても `index.html` を返すように、配信先を設定してください。

- **GitHub Pages**：*Settings → Pages → Source* を *GitHub Actions* にすると、`main` に push するたびに `.github/workflows/pages.yml` で公開されます。独自ドメインのルートで配信する場合は、リポジトリ変数 `PAGES_BASE` に `/` を設定してください。
- **そのほかの配信先**：サブパスで配信する場合は `npx vite build --base=/配信パス/` でビルドします。

### Android の APK を配布する

`v1.0.0` のようなタグを push すると、`.github/workflows/android-release.yml` で APK がビルドされ、GitHub Releases に添付されます。リリース用の署名鍵で署名するには、次の Secrets を登録してください。未登録の場合はデバッグ署名の APK になります。

| Secret | 値 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | キーストアを base64 にしたもの（`base64 -i release.keystore`） |
| `ANDROID_KEYSTORE_PASSWORD` | キーストアのパスワード |
| `ANDROID_KEY_ALIAS` | キーのエイリアス |
| `ANDROID_KEY_PASSWORD` | キーのパスワード |

## Spotify 連携（任意）

連携しなくても、曲のジャケットは iTunes から取得されます。ただしアーティスト写真は取得されません。連携する場合は次の手順で設定します。

1. [Spotify for Developers](https://developer.spotify.com/dashboard) でアプリを作成します。
2. アプリの **設定 → Spotify 連携** に Client ID と Client Secret を入力します。

キーは端末内（`localStorage`）にだけ保存され、送信先は Spotify だけです。Client Credentials フローを使うため、Spotify アカウントでのログインは不要です。端末やブラウザのプロファイルにアクセスできる人はキーを読めるので、ほかのサービスと共用しているキーは使わないでください。

## プライバシー

- ライブの記録、写真、設定は端末内（IndexedDB / localStorage）にだけ保存されます。サーバーやアカウントはありません。
- アートワークを取得するために、アーティスト名と曲名を Spotify（`api.spotify.com`、`open.spotify.com`）と Apple（`itunes.apple.com`）に送信します。画像はそれぞれの CDN から読み込みます。

## 構成

```
src/
  main.js          ルート定義とタブバー
  router.js        画面スタック、遷移アニメーション、スワイプで戻る
  db.js            IndexedDB（Dexie）とデータ変更の通知
  domain/stats.js  集計（ランキング、カレンダーなど）
  pages/           各画面
  ui/              共通部品、アニメーション、アイコン、ハプティクス
  trackArt.js      曲アートワークの取得（Spotify / iTunes）
  sync.js          アーティスト画像の同期
public/            PWA のマニフェスト、Service Worker、アイコン
android/ ios/      Capacitor のネイティブプロジェクト
```

## コントリビュート

Issue と Pull Request を歓迎します。Pull Request の前に、`npm run build` が通ること、変更した画面が `npm run dev` のモバイル幅（375px）で正しく動くことを確認してください。

セキュリティ上の問題の報告方法は [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

[MIT](LICENSE)
