# React + TypeScript + Vite

## LINE MINI App認証

ローカルでは`.env.example`を`.env.local`へコピーし、LINE Developers Consoleで発行したLIFF IDを設定する。

```bash
cp .env.example .env.local
```

`VITE_LINE_LIFF_ID`は公開されるフロントエンド設定値であり、チャネルシークレットは設定しない。
認証時はLIFF SDKで取得したIDトークンをバックエンドへ送り、アプリのログイン状態はバックエンドが発行するHttpOnly Cookieで保持する。

### 開発用の認証状態確認

LINEログインなしで認証後の画面を確認する場合は、`.env.local` に次を設定する。

```env
VITE_DEV_LIFF_MODE=true
VITE_DEV_AUTH_MODE=authenticated
```

`VITE_DEV_AUTH_MODE=authenticated` は Vite の開発時だけ有効な表示確認用のモックで、バックエンドの認証セッションやLINEログインを作成しない。実際の認証連携を確認するときは、この設定を外し、`VITE_LINE_LIFF_ID` を設定する。

## 画面確認用データ

取得・リアクション・クイズ・履歴のAPIが未実装の間、Vite開発環境ではサンプルの声で各画面を操作できる。通常ブラウザではフィードと詳細を確認できる。`.env.local` に上記2つの開発用設定を指定すると、投稿・クイズ・履歴も確認できる。開発用認証モードでの投稿はAPIへ送られず、画面内だけに反映される。サンプルの既読・リアクション・投稿・回答は再読み込みで消える。

開発時に `?mockState=loading`、`?mockState=empty`、`?mockState=error` を画面URLへ付けると、取得画面の各状態を確認できる。これらのサンプル表示は本番ビルドでは使わない。本番で未接続の取得画面には準備中の案内を表示する。投稿は実際のLINE認証後に既存のAPIへ送信する。

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
