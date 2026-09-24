# React + TypeScript + Vite

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

### 開発時のLINE認証

実際のLINE認証を確認する場合は、`.env.local`を次のように変更する。

```env
VITE_LINE_LIFF_ID=<LINE Developers Consoleで発行したLIFF ID>
VITE_DEV_LIFF_MODE=false
VITE_DEV_AUTH_MODE=
```

設定変更後に開発サーバーを再起動し、LINEミニアプリから開く。認証時はLIFF SDKで取得したIDトークンをバックエンドへ送り、アプリのログイン状態はバックエンドが発行するHttpOnly Cookieで保持する。

## デモ画面

QuizとHistoryはAPI未実装のため、Vite開発環境ではサンプルデータを表示する。Feed、詳細、投稿、リアクション、既読は実APIへ接続している。

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
