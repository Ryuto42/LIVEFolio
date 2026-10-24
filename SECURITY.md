# Security Policy / セキュリティポリシー

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Include the steps to reproduce, the affected platform (iOS / Android / web), and the version.

We will reply as soon as we can and publish a fix once it is ready.

## 脆弱性の報告

セキュリティ上の問題は、公開の Issue に書かないでください。このリポジトリの **Security** タブにある **Report a vulnerability** から、非公開で報告してください。再現手順、対象のプラットフォーム（iOS / Android / Web）、バージョンを添えてください。

できるだけ早く返信し、修正の準備ができしだい公開します。

## Scope / 対象

LIVEFolio stores all data on the device and has no server. The main areas of concern are:

- Content injected into the page (for example, through imported backup files)
- Data sent to external services (Spotify, iTunes)
- Platform settings of the native apps (Android / iOS)

LIVEFolio はデータをすべて端末に保存し、サーバーを持ちません。主に次の点が対象になります。

- ページへの不正な内容の挿入（インポートしたバックアップファイル経由など）
- 外部サービス（Spotify、iTunes）へ送るデータ
- ネイティブアプリ（Android / iOS）のプラットフォーム設定
