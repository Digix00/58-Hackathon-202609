# Backend

Cloudflare Workers上で動く [Hono](https://hono.dev/) 製API。データストアは [D1](https://developers.cloudflare.com/d1/) ([Drizzle ORM](https://orm.drizzle.team/) 経由)。

## アーキテクチャ

バックエンドは依存関係が内側へ向くよう、次のレイヤーに分けている。

```text
src/
├── app/                         # Honoアプリ、共通middleware・error handler
├── bootstrap/container.ts       # 全機能のComposition Root
├── features/                    # 機能単位の独立したモジュール
│   └── health/
│       ├── application/         # UseCaseとRepository Port
│       ├── infrastructure/      # D1/Drizzle Adapter
│       └── presentation/        # Hono Handler
├── infrastructure/database/    # 機能横断のDB schema
└── index.ts                     # Worker entry point
```

`bootstrap/container.ts`だけが具象クラスを知るComposition Rootである。`index.ts`から
Workerモジュールの初期化時に
Repository → UseCase → Handler → Appの順でDIするため、リクエストごとに依存オブジェクトを
生成しない。ルートにはDI済みHandlerのメソッドだけが渡される。

新しい機能は`features/<feature-name>`単位で追加する。その中のApplication層にPortとUseCase、
Infrastructure層にPortの実装、Presentation層にHandlerを置き、最後に`container.ts`で依存を組み立てる。
`createApp`へ注入可能な形を保つことで、テストではD1を起動せずFakeを渡せる。

## セットアップ

```bash
pnpm install
wrangler login          # 初回のみ、Cloudflareアカウントとの連携
wrangler d1 create 58-hackathon-db
```

`wrangler d1 create` の出力に含まれる `database_id` を `wrangler.jsonc` の
`d1_databases[0].database_id` に設定する。

## ローカル開発

```bash
pnpm db:migrate:local   # ローカルD1にマイグレーションを適用
pnpm dev                # http://localhost:8787
```

## デプロイ

`main`ブランチに`backend/**`の変更がpushされると、
[`.github/workflows/backend-deploy.yml`](../.github/workflows/backend-deploy.yml)が
D1マイグレーションの適用とWorkersへのデプロイを自動実行する。

手元から手動で行う場合:

```bash
pnpm db:migrate:remote  # 本番D1にマイグレーションを適用
pnpm deploy
```

### CIに必要なGitHub Secrets

| Secret名 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | wranglerの非対話認証。D1編集権限・Workers編集権限を持つトークンを発行する |
| `CLOUDFLARE_ACCOUNT_ID` | 対象のCloudflareアカウントID |

D1データベース自体の作成(`wrangler d1 create`)はリソースを一度きり作るだけの操作であり、
既存DBの再作成を避けるため自動化はせず、上記「セットアップ」の手順として手動で行う。


## スキーマ変更

`src/infrastructure/database/schema.ts` を編集後、以下でマイグレーションSQLを生成する。

```bash
pnpm db:generate
```

## テスト/Lint

```bash
pnpm test    # vitest + @cloudflare/vitest-pool-workers (ローカルD1をエミュレート)
pnpm lint    # oxlint
pnpm build   # tsc --noEmit
```
