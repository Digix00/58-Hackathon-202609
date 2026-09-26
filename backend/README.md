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
│   │   ├── concern-cluster.ts
│   │   ├── session.ts
│   │   └── user.ts
│   ├── repository/              # 永続化処理のPort
│   │   ├── auth.repository.ts
│   │   ├── concern-cluster-summary.repository.ts
│   │   ├── concern-processing.repository.ts
│   │   └── health.repository.ts
│   ├── port/                    # 外部サービスのPort
│   │   ├── concern-processing-queue.ts
│   │   ├── concern-cluster-summary-generator.ts
│   │   ├── concern-vector-index.ts
│   │   ├── line-token-verifier.ts
│   │   ├── speech-recognizer.ts
│   │   ├── text-embedding-generator.ts
│   │   └── text-translator.ts
│   └── usecase/                 # Application UseCase
│       ├── auth.usecase.ts
│       ├── concern-processing.usecase.ts
│       ├── concern.usecase.ts
│       └── check-health.usecase.ts
├── infrastructure/              # D1/Drizzle・外部サービスのAdapter
│   ├── ai/
│   │   ├── local-concern-cluster-summary.generator.ts
│   │   ├── local-text-embedding.generator.ts
│   │   ├── local-text.translator.ts
│   │   ├── workers-ai-speech.recognizer.ts
│   │   ├── workers-ai-concern-cluster-summary.generator.ts
│   │   ├── workers-ai-text-embedding.generator.ts
│   │   └── workers-ai-text.translator.ts
│   ├── database/
│   │   ├── d1-auth.repository.ts
│   │   ├── d1-concern-cluster-summary.repository.ts
│   │   ├── d1-concern-processing.repository.ts
│   │   ├── d1-health.repository.ts
│   │   └── schema.ts
│   ├── queue/
│   │   ├── cloudflare-concern-processing.consumer.ts
│   │   └── cloudflare-concern-processing.queue.ts
│   ├── line/line-api.client.ts
│   └── vectorize/cloudflare-concern-vector-index.ts
├── presentation/                # HTTP Handler
│   ├── auth.handler.ts
│   └── health.handler.ts
└── index.ts                     # Worker entry point
```

`bootstrap/container.ts`だけが具象クラスを知るComposition Rootである。`index.ts`から
Workerモジュールの初期化時に
Repository → UseCase → Handler / Queue Consumer → Appの順でDIするため、リクエストごとに依存
オブジェクトを生成しない。ルートにはDI済みHandlerとQueue Consumerのメソッドだけが渡される。

Application層にEntity、Repository/外部サービスのPort、UseCaseを置き、Infrastructure層にPortの実装、
Presentation層にHandlerを置く。機能名はファイル名に含め、依存は`container.ts`で組み立てる。
`createApp`へ注入可能な形を保つことで、テストではD1を使わずFakeを渡せる。

## Workers AI

`wrangler.jsonc` の `ai.binding` でWorkers AIを `AI` としてWorkerへ接続する（[binding設定](https://developers.cloudflare.com/workers-ai/configuration/bindings/)）。Application層からはPortだけを呼び出し、Infrastructure層のAdapterが `AI.run(model, input)` を実行する。

- `WorkersAiTextTranslator`: 1つの多言語Instruction modelで、原文（日本語）→英語、原文（日本語）→ひらがなを処理する
- `WorkersAiTextEmbeddingGenerator`: [Qwen3-Embedding-0.6B](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/) で入力順を保ったベクトルを生成する
- `WorkersAiSpeechRecognizer`: `@cf/openai/whisper-large-v3-turbo` へBase64音声を送り、日本語の文字起こしを行う
- `WorkersAiConcernClusterSummaryGenerator`: 最大10件、各2000文字までの悩み本文を使ってクラスタラベルと要約を生成する

各Adapterは `env.AI` を注入して直接呼び出せるため、ジョブやUseCaseから利用できる。テストではWorkers AI bindingをFakeに差し替え、Cloudflareへの実呼び出しを行わない。

Workers AI bindingはローカルシミュレーションが存在せず、`wrangler dev`実行時はCloudflareへのリモート接続を試みる。ローカル開発 (`pnpm dev`) は`ai.binding`を含まない`wrangler.dev.jsonc`を使い、`bootstrap/container.ts`が`env.AI`の有無で`LocalTextTranslator`/`LocalTextEmbeddingGenerator`（決定的なダミー結果を返すだけでCloudflareを呼ばない）へ自動的に切り替えるため、Workers AIの認証なしで起動できる。実際のWorkers AIで動作確認したい場合は`wrangler login`後に`pnpm --filter backend exec wrangler dev`（`--config`省略、本番用`wrangler.jsonc`を使用）で起動する。この設定は本番用Vectorize indexへ書き込むため、通常の開発には使わない。Vectorizeの連携確認には、開発用indexを使う`pnpm dev:vectorize`を利用する。

## 音声文字起こしAPIの確認

通常の `pnpm dev` と `pnpm dev:vectorize` は固定値 `[local-dev transcript]` を返す。実際の文字起こしは、音声確認専用の設定で起動する。

```bash
pnpm --filter backend exec wrangler login
pnpm --filter backend db:migrate:local
pnpm --filter backend dev:speech
```

この設定はローカルD1とWorkers AIだけを使う。開発用ログインを含む設定なので、本番へデプロイしない。短いテスト用音声を用意し、別ターミナルから確認する。

```bash
curl --fail-with-body -sS -c /tmp/speech-dev-cookie.txt \
  -H 'Content-Type: application/json' \
  -d '{"userKey":"demo-a"}' http://localhost:8787/api/v1/auth/dev > /dev/null
curl --fail-with-body -sS -b /tmp/speech-dev-cookie.txt \
  -F 'audio=@/path/to/test.wav;type=audio/wav' -F 'language=ja' \
  http://localhost:8787/api/v1/speech/transcriptions
rm /tmp/speech-dev-cookie.txt
```

`200` の `text` が認識結果。Workers AIの利用量が発生する。モデルの[公式スキーマ](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/schema-input.json)と[公式のBase64送信例](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/)に従い、`audio`、`task: "transcribe"`、`language: "ja"` を指定する。通常のテストはFakeを使い、実推論を行わない。

回帰テストの `test/support/recorded-audio.json` は合成音だけをgzip/Base64にしたもの。ChromeのMediaRecorderによるWebMと、macOSの `afconvert` による60秒のAACを含み、人の録音は保存しない。

## Queue

`wrangler.jsonc` の `CONCERN_PROCESSING_QUEUE` producer binding と consumer設定で、投稿保存後のAI処理をQueueへ分離する。投稿作成時に `concern.process` メッセージを送信し、Workerの `queue` ハンドラーから `ConcernProcessingUseCase` を呼び出す。

Queue consumerからひらがな・英語表現とEmbeddingを生成し、表現とクラスタ割当をD1へ、EmbeddingをCloudflare Vectorizeへ保存する。Vectorizeは内部のクラスタリング処理からのみ利用し、任意の文章を受け取る公開検索APIやRAGは追加しない。近傍上位10件を調べ、cosine scoreが既定値0.8以上の最上位クラスタへ割り当てる。近傍候補のない投稿は新しいクラスタを作る。新規のpending clusterには、最大10件の公開済み悩みからlabelとsummaryを生成してD1へ保存する。生成済みクラスタへ投稿が追加された後の再生成は後続PRで扱う。

Workers AIへ送る本文は1クラスタあたり最大10件、各2000文字までに制限する。生成結果はJSON形式とlabel/summaryの非空を検証し、出力内容の長さ、個人情報、語句によるパターン検査は行わない。プロンプトで連絡先、URL、個人名、住所、攻撃的・差別的な表現を出さないよう指示し、形式が不正な応答はQueueで再試行する。別のQueue配信が同じclusterを生成中の場合、投稿をreadyにせず再試行する。claim後のD1読み込みに失敗した場合もclaimの解放を試みて再試行する。Queueの失敗はメッセージ単位で再試行し、D1に確定したcluster IDを再利用する。投稿ごとのEmbedding model/index versionをD1へ記録し、バージョンが変わった投稿はQueue再処理でVectorizeへ再登録する。処理が失敗した投稿はクラスタを表示せず原文で閲覧できる。Vectorize metadataにはcluster IDだけを保存し、投稿本文などの個人情報を含めない。

初回だけQueueを作成する。

```bash
pnpm --filter backend exec wrangler queues create 58-hackathon-concern-processing
```

実際のWorkers AIで推論した場合はCloudflareアカウントのWorkers AI利用量に計上されるため、[料金と無料枠](https://developers.cloudflare.com/workers-ai/platform/pricing/)を確認して必要最小限の回数で実行する（前述の通り、`pnpm dev`によるローカル開発では既定でこの呼び出しは発生しない）。

## セットアップ

```bash
pnpm install
```

`pnpm dev` によるローカル開発だけであればここまでで完了する（`wrangler login`は不要）。
`wrangler d1 create` でのDB新規作成、`db:migrate:remote`、`deploy`、実際のWorkers AIでの動作確認など、
Cloudflareアカウントへアクセスする操作を行う場合だけ、追加で以下を行う。

```bash
wrangler login          # 初回のみ、Cloudflareアカウントとの連携
wrangler d1 create 58-hackathon-db
```

`wrangler d1 create` の出力に含まれる `database_id` を `wrangler.jsonc` の
`d1_databases[0].database_id` に設定する。

## ローカル開発

```bash
pnpm db:migrate:local   # ローカルD1にマイグレーションを適用
pnpm dev                # http://localhost:8787、wrangler.dev.jsonc を使用
```

`pnpm dev` は `wrangler.dev.jsonc` を使い、Workers AI / Vectorizeのremote bindingなしでローカルD1・Queueを起動する。Workers AIの処理はローカル用アダプタの決定的なダミー結果になるため、`wrangler login` は不要。

Vectorizeとの連携を開発環境で確認するときは `pnpm dev:vectorize` を使う。この設定もWorkers AI bindingは使わず、ローカル用Embeddingを開発用のremote Vectorize index (`58-hackathon-concern-vectors-dev`) へ登録する。このモードではVectorizeへの接続にCloudflareログインが必要。本番indexとは分離され、開発中のupsertが本番の検索データを変更しない。

PLaMo-Embedding-1Bは2048次元ですが、Cloudflare Vectorizeの現行上限1536次元を超えるため使いません。Qwen3-Embedding-0.6Bは1024次元でVectorizeに対応します（[Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/)、[Workers AI Qwen3 Embedding](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/)）。初回のみ次を開発・本番環境で個別に実行します。

```bash
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors-dev --dimensions=1024 --metric=cosine
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors --dimensions=1024 --metric=cosine
```

Vectorize indexを再作成した場合は、`CONCERN_VECTOR_INDEX_VERSION` を環境ごとに更新してください。登録済み投稿のEmbedding versionと一致しなくなるため、次にQueueで再処理された投稿は現在のindexへupsertされます。本番の類似度閾値はGitHub Actions Variable `CONCERN_CLUSTER_SIMILARITY_THRESHOLD` から渡し、未設定時は `0.8` を使います。ローカル開発の閾値は `wrangler.dev.jsonc` で設定します。

### ローカル用サンプル投稿

Feed・投稿詳細の動作確認に使うサンプル投稿は、ローカルD1へ次のコマンドで投入できる。

```bash
pnpm db:seed:local
```

`scripts/seed-local-posts.sql` は固定IDと `INSERT OR IGNORE` を使うため、何度実行しても同じ6件だけが登録される。
投稿は `published`、処理状態は `pending` として登録されるため、翻訳・ひらがな化が未完了でも原文のFeed表示を確認できる。
このSQLはローカル動作確認専用であり、`db:migrate:remote` やリモートD1への実行には使わない。

## LINE MINI App認証

LINE Developers Consoleで設定したチャネルIDを、Workerの`LINE_CHANNEL_ID`へ設定する。
チャネルシークレットやアクセストークンをフロントエンドへ配置してはいけない。

```text
LINE_CHANNEL_ID=<LINE LoginまたはLINE MINI AppのチャネルID>
AUTH_SESSION_TTL_SECONDS=2592000  # 任意。既定は30日
```

Workerは配信メッセージ内のクイズリンクを作るために`LINE_LIFF_ID`を使う。
自動デプロイではフロントエンドと同じGitHub Actions Variable `VITE_LINE_LIFF_ID`をWorkerへ渡す。
`CORS_ORIGIN`はブラウザーの許可Origin用であり、LIFFリンクの生成には使わない。
手動でWorkerをデプロイする場合も、同じLIFF IDをWorkerの`LINE_LIFF_ID`変数へ設定する。

フロントエンドから送られたIDトークンは、WorkerがLINEのVerify ID token APIへ送信して検証する。
検証後はアプリ独自の`__Host-session` Cookieを発行し、以後のAPIではLINEトークンを再利用しない。

LIFFアプリには`openid`スコープを設定する。プロフィール情報が必要になった場合でも、認証の根拠として
フロントエンドからuserIdやプロフィール情報を送信せず、LINEから検証されたトークンを基準に扱う。

### LINE Webhook とデイリークイズ配信

Webhook署名と配信には、Worker側だけに次のSecretを設定する。これらをフロントエンドの環境変数へ置かない。

```text
LINE_CHANNEL_SECRET=<Messaging APIチャネルのシークレット>
LINE_CHANNEL_ACCESS_TOKEN=<Messaging APIチャネルアクセストークン>
INTERNAL_API_TOKEN=<内部配信API用の十分に長いランダム値>
```

自動デプロイでは、これらを GitHub Secrets の `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`INTERNAL_API_TOKEN` に設定する。`LINE_CHANNEL_ID` は既存の GitHub Secret を使う。GitHub Actions Variables には `VITE_LINE_LIFF_ID`、`CORS_ORIGIN`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` を設定する。`VITE_LINE_LIFF_ID` はフロントエンドのLIFF初期化とWorkerの配信URL生成で共有する。

管理画面 `/admin/line-broadcast` の API は Cloudflare Access で保護する。Cloudflare Access に管理画面と Worker API のアプリケーションを設定し、運用担当者だけを許可する。Workerの変数には次を設定する。

```text
ACCESS_TEAM_DOMAIN=<team-name>.cloudflareaccess.com
ACCESS_AUD=<Worker API用 Access application の AUD tag>
CORS_ORIGIN=<管理画面を配信するフロントエンドのorigin>
```

管理画面から配信を起動する POST は、Cloudflare Access に加えて `Origin` が `CORS_ORIGIN` と一致することをサーバー側で確認する。`Origin` がない、`null`、形式不正、または別 Origin の場合は拒否する。管理画面用の `CORS_ORIGIN` はワイルドカードではなく、フロントエンドの単一 Origin を設定する。

Workerは `Cf-Access-Jwt-Assertion` の署名、issuer、audienceを検証する。Cloudflare Accessのポリシーでも担当者を制限し、API側のJWT検証を無効にしない。管理画面はAccess認証CookieでAPIを呼び出すため、`INTERNAL_API_TOKEN` はブラウザーに渡らない。

ローカルの `wrangler.dev.jsonc` と `wrangler.vectorize.dev.jsonc` では、`DEV_AUTH_ENABLED=true`、`DEV_ACCESS_BYPASS=true`、`DEV_LINE_BROADCAST_SIMULATION=true` が設定されるため、Cloudflare Accessなしで管理画面から生成・配信フローを確認できる。最初の2つが揃うと管理 API のAccess検証を省略し、3つすべてが揃うとLINE APIへ送信せず、受付状態を模擬する。画面も「開発用シミュレーション」と表示する。これらのフラグはローカル開発設定だけに置き、本番設定には追加しない。

WranglerのCron Triggerは毎日 `0 0 * * *` UTC（09:00 JST）に起動する。当日公開クイズがなければ候補から生成を試み、公開クイズができた場合だけ配信処理を実行する。本番はLINE Broadcast APIへ送信し、ローカル開発は模擬受付を記録する。`deliveryMode` は `line_api` または `simulation` を示す。本番の `succeeded` はLINE APIがリクエストを受け付けたことを示し、各友だちへの到達状況を表さない。

内部連携から既存の公開クイズだけを再試行する場合は `POST /api/v1/line/broadcasts/daily-quiz` を使い、`INTERNAL_API_TOKEN` をBearer認証で渡す。このトークンをブラウザーから送信しない。

### ローカル開発用認証

`wrangler.dev.jsonc` と `wrangler.vectorize.dev.jsonc` では `DEV_AUTH_ENABLED=true` が設定され、
`POST /api/v1/auth/dev` で `demo-a`、`demo-b`、`demo-c` の開発ユーザーへログインできる。
このエンドポイントは固定キーをサーバー側で開発用IDへ変換し、LINEログインと同じHttpOnly Cookieセッションを発行する。
本番用 `wrangler.jsonc` にはこの変数がないため、開発用認証は404となる。

`make dev` ではローカルD1へのマイグレーション後に、開発用ユーザー、サンプル投稿、当日クイズを投入する。
個別に投入する場合は次を実行する。

```bash
pnpm --filter backend db:seed:local
```

## CORS

許可するオリジンは Cloudflare Worker の `CORS_ORIGIN` 環境変数から取得する。
Cookie セッションを使う認証 API では、環境ごとにフロントエンドの origin を必ず設定する。
未設定時の `*` は認証情報を送らないローカル確認用のフォールバックとして扱う。
管理配信 POST は CSRF 対策として同じ `CORS_ORIGIN` をサーバー側でも照合し、未設定時や Origin 欠落時は拒否する。

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

## テスト/Lint/Format

```bash
pnpm test           # vitest + @cloudflare/vitest-pool-workers (ローカルD1をエミュレート)
pnpm lint           # oxlint
pnpm format         # biome check --write . (フォーマットのみ。lintはoxlintが担当)
pnpm format:check   # biome check .
pnpm build          # tsc --noEmit
```

Vitest は `wrangler.test.jsonc` を使い、ローカル D1 をエミュレートする。Workers AI binding はテスト設定に含めず、AI Adapter のテストでは Fake を注入してCloudflareへの推論リクエストを発生させない。
