# React + TypeScript + Vite

画面を編集するAIエージェント・開発者は、[フロントエンド実装指針](../docs/technical/frontend.md)と[LINEミニアプリ固有の挙動とフロントエンド編集ガイド](../docs/technical/line-mini-app.md)を先に確認する。

## LINE MINI App認証

ローカルの環境変数はGit管理外の`.env.local`で設定する。`make dev`または`make frontend`を実行すると、`.env.local`がない場合だけ`.env.example`から自動作成される。手動で作成する場合は次を実行する。

```bash
cp frontend/.env.example frontend/.env.local
```

`VITE_LINE_LIFF_ID`は公開されるフロントエンド設定値であり、チャネルシークレットは設定しない。実際のLINE認証を確認する場合だけ、LINE Developers Consoleで発行したLIFF IDを設定する。

### ローカル開発用認証

`.env.example`は、LINEログインなしでAPI・D1を含む動作確認ができるデバッグモードを既定値としている。

```env
VITE_DEV_LIFF_MODE=true
VITE_DEV_AUTH_MODE=backend
VITE_DEV_USER=demo-a
```

`VITE_DEV_USER`には`demo-a`、`demo-b`、`demo-c`のいずれかを指定する。フロントエンドは開発専用APIからLINEログインと同じHttpOnly Cookieセッションを取得するため、フィード・投稿詳細・閲覧記録・リアクション・投稿・プロフィール保存をローカルD1で確認できる。
開発用認証エンドポイントは開発用Worker設定でのみ有効で、本番用設定では利用できない。

Historyも実APIへ接続しており、ログイン中ユーザー自身の既読・クイズ履歴を表示する。ローカルで確認するには、上記の開発用認証設定（`VITE_DEV_LIFF_MODE=true`、`VITE_DEV_AUTH_MODE=backend`、`VITE_DEV_USER`）を使ってログイン済みセッションを作り、バックエンドとD1を起動する。D1に当該ユーザーの既読またはクイズ回答がない場合は空状態が表示される。

### 開発時のLINE認証

実際のLINE認証を確認する場合は、`.env.local`を次のように変更する。

```env
VITE_LINE_LIFF_ID=<LINE Developers Consoleで発行したLIFF ID>
VITE_DEV_LIFF_MODE=false
VITE_DEV_AUTH_MODE=
```

設定変更後に開発サーバーを再起動し、LINEミニアプリから開く。認証時はLIFF SDKで取得したIDトークンをバックエンドへ送り、アプリのログイン状態はバックエンドが発行するHttpOnly Cookieで保持する。

## API接続済み画面

QuizとHistoryはAPIへ接続している。HistoryはLINEログイン済みユーザー自身の学習履歴を表示する。Feed、詳細、投稿、リアクション、既読も実APIへ接続している。

### 投稿の音声入力の確認

`/post` で「話して書く」→マイク許可→「停止して文字にする」→「本文に追加」と操作する。既存本文は保持し、追加後に修正して投稿できる。最大59秒で自動停止する。権限拒否・録音非対応・通信失敗の場合も手入力を利用できる。

通常の `pnpm --filter backend dev` は `[local-dev transcript]` という固定結果を返す。実際の日本語認識は [backend READMEの音声API確認手順](../backend/README.md#音声文字起こしapiの確認) に従い、`pnpm --filter backend dev:speech` と接続して確認する。LINE実機ではHTTPSのエンドポイントを使い、開発用認証フラグを無効にして確認する。

録音の回帰テストは `pnpm --filter frontend test:speech`、翻訳辞書の確認は `pnpm --filter frontend test:i18n` を使う。

## コード整形

フロントエンドのコード整形には Prettier を使用する。

```bash
pnpm --filter frontend format
pnpm --filter frontend format:check
```

`format:check` は、整形が必要なファイルがないことを確認するCI向けのコマンド。

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## デプロイ

Cloudflare Workers (Static Assets) 上にホストする。`main`ブランチに`frontend/**`の変更が
pushされると、[`.github/workflows/frontend-deploy.yml`](../.github/workflows/frontend-deploy.yml)が
ビルドとデプロイを自動実行する。

手元から手動で行う場合:

```bash
pnpm build
pnpm deploy
```

CIに必要なGitHub Secrets (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`) は
backendと共通。詳細は[`backend/README.md`](../backend/README.md#ciに必要なgithub-secrets)を参照。

ビルド時はGitHub Actions Variablesから以下を注入する。未設定の場合はBuildステップで
Workflowを失敗させる。

| Variable            | 説明                                         |
| ------------------- | -------------------------------------------- |
| `VITE_API_BASE_URL` | フロントエンドが接続するバックエンドAPIのURL |
| `VITE_LINE_LIFF_ID` | LINE Developers Consoleで発行したLIFF ID     |
