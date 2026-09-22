# Backend

Cloudflare Workers上で動く [Hono](https://hono.dev/) 製API。データストアは [D1](https://developers.cloudflare.com/d1/) ([Drizzle ORM](https://orm.drizzle.team/) 経由)。

## アーキテクチャ

バックエンドは機能名ではなくレイヤーごとに分け、Health 関連のファイルは名前で識別する。

```text
src/
├── app/                         # Honoアプリ、共通middleware・error handler
├── bootstrap/container.ts       # 全機能のComposition Root
├── application/                 # UseCase、Port、Application model
│   ├── entity/                  # Application Entity
│   │   ├── health-status.entity.ts
│   │   ├── session.ts
│   │   └── user.ts
│   ├── repository/              # 永続化処理のPort
│   │   ├── auth.repository.ts
│   │   └── health.repository.ts
│   ├── port/                    # 外部サービスのPort
│   │   └── line-token-verifier.ts
│   └── usecase/                 # Application UseCase
│       ├── auth.usecase.ts
│       └── check-health.usecase.ts
├── infrastructure/              # D1/Drizzle・外部サービスのAdapter
│   ├── database/
│   │   ├── d1-auth.repository.ts
│   │   ├── d1-health.repository.ts
│   │   └── schema.ts
│   └── line/line-api.client.ts
├── presentation/                # HTTP Handler
│   ├── auth.handler.ts
│   └── health.handler.ts
└── index.ts                     # Worker entry point
```

`bootstrap/container.ts`だけが具象クラスを知るComposition Rootである。`index.ts`から
Workerモジュールの初期化時に
Repository → UseCase → Handler → Appの順でDIするため、リクエストごとに依存オブジェクトを
生成しない。ルートにはDI済みHandlerのメソッドだけが渡される。

Application層にEntity、Repository/外部サービスのPort、UseCaseを置き、Infrastructure層にPortの実装、
Presentation層にHandlerを置く。機能名はファイル名に含め、依存は`container.ts`で組み立てる。
`createApp`へ注入可能な形を保つことで、テストではD1を使わずFakeを渡せる。

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

## LINE MINI App認証

LINE Developers Consoleで設定したチャネルIDを、Workerの`LINE_CHANNEL_ID`へ設定する。
チャネルシークレットやアクセストークンをフロントエンドへ配置してはいけない。

```text
LINE_CHANNEL_ID=<LINE LoginまたはLINE MINI AppのチャネルID>
AUTH_SESSION_TTL_SECONDS=2592000  # 任意。既定は30日
```

フロントエンドから送られたIDトークンは、WorkerがLINEのVerify ID token APIへ送信して検証する。
検証後はアプリ独自の`__Host-session` Cookieを発行し、以後のAPIではLINEトークンを再利用しない。

LIFFアプリには`openid`スコープを設定する。プロフィール情報が必要になった場合でも、認証の根拠として
フロントエンドからuserIdやプロフィール情報を送信せず、LINEから検証されたトークンを基準に扱う。

## CORS

許可するオリジンは Cloudflare Worker の `CORS_ORIGIN` 環境変数から取得する。
Cookie セッションを使う認証 API では、環境ごとにフロントエンドの origin を必ず設定する。
未設定時の `*` は認証情報を送らないローカル確認用のフォールバックとして扱う。

- 本番: `wrangler.jsonc` の `vars.CORS_ORIGIN` にデプロイ済みフロントエンドの origin を設定する。
- ローカル: `.dev.vars`（`.dev.vars.example` をコピーして作成、git管理外）に
  ローカルフロントエンド（`pnpm dev` 実行時、既定で `http://localhost:5173`）の origin を設定する。
  `.dev.vars` は `wrangler dev` 実行時に `wrangler.jsonc` の `vars` より優先される。

Cookie認証を利用するため、フロントエンドのAPIクライアントはcredentialsを含めて通信する。
本番では`CORS_ORIGIN`を`*`にせず、実際のフロントエンドoriginへ固定する。

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
