# 58-Hackathon-202609

pnpm workspaceによるmonorepo。

- [`frontend/`](./frontend) — React + Vite。Cloudflare Pages想定。
- [`backend/`](./backend) — Hono + Cloudflare Workers + D1。詳細は[backend/README.md](./backend/README.md)。

frontendは`backend`パッケージをworkspace依存として参照し、[Hono RPC](https://hono.dev/docs/guides/rpc)経由で
バックエンドの型を直接importしてAPI通信の型安全性を得ている(`frontend/src/lib/api.ts`)。

## ローカル開発

```bash
make dev
```

依存インストール → ローカルD1へのマイグレーション・開発用データ適用 → backend([http://localhost:8787](http://localhost:8787))と
frontend([http://localhost:5173](http://localhost:5173))の同時起動、をこの1コマンドで行う。終了はCtrl+C。

個別に立ち上げたい場合は `make backend` / `make frontend` / `make db-migrate`、開発用データだけを再投入する場合は `make db-seed-local`、コマンド一覧は `make help`。

> Cloudflare D1はローカル開発時`wrangler dev`が内部(miniflare)でSQLiteとして扱うため、
> 独立して常駐する「DBサーバー」は存在しない。ローカルDBを使える状態にする作業は
> マイグレーション適用(`make db-migrate`)と開発用データ投入(`make db-seed-local`)で完結する。

## セットアップ

```bash
pnpm install
```

## ワークスペース共通コマンド

```bash
pnpm build   # 全パッケージのbuildスクリプトを実行
pnpm lint    # 全パッケージのlintスクリプトを実行
pnpm test    # testスクリプトがあるパッケージのテストを実行
```

個別のパッケージに対しては `pnpm --filter frontend <script>` / `pnpm --filter backend <script>` を使う。

`pnpm` のコマンドはワークスペース単位の基本操作に使う。現在、frontendにはtestスクリプトがないため、`pnpm test` ではbackendのテストが実行される。

GitHub Actions のfrontend/backendチェックをPull Request前にまとめて確認する場合は、次を使う。

```bash
make check
```

`make check` はfrontendのformat check・lint・buildと、backendのformat check・lint・build・testを実行する。個別に確認する場合は `make check-frontend` または `make check-backend` を使う。
