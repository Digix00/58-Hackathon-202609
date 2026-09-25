# 目安箱 開発・運用方針

ローカル開発、デプロイ、CI、運用、実装前の確認事項、ロードマップを定義する。

## 開発・運用要件

### ローカル開発

```bash
pnpm install
make db-migrate
make dev
```

バックエンドは `http://localhost:8787`、フロントエンドは `http://localhost:5173` を利用する。D1はWranglerのローカル環境を使い、独立したDBサーバーを起動しない。

`make dev`または`make frontend`は、`frontend/.env.local`がない場合だけ`frontend/.env.example`から自動作成する。`.env.local`はGit管理外であり、既存のファイルは上書きしない。初期設定ではLINEログインなしで確認できるローカルデバッグモードが有効になる。

Wrangler `4.131.1` が Node.js 22 以上を要求するため、ローカル開発・D1操作は Node.js 22 以上で実行する。

Feed・投稿詳細の動作確認用データが必要な場合は、バックエンドのローカル専用seedを使う。

```bash
pnpm --filter backend db:seed:local
```

開発用ユーザー3件、当日クイズ、公開投稿3件、原文表示を確認する公開投稿6件を登録し、再実行しても重複しない。
投稿は`visibility_status=published`で登録し、処理済み表示用の投稿は`processing_status=ready`、非同期処理の状態を再現する投稿は`processing_status=pending`とする。
このコマンドはローカルD1専用であり、本番D1へ適用してはならない。実際のLINE認証連携を確認する場合は、開発用認証モードを外してLINEログインを使う。

### ローカル統合認証

LINEログインなしで認証が必要な機能を確認する場合は、`frontend/.env.local`で`VITE_DEV_LIFF_MODE=true`、`VITE_DEV_AUTH_MODE=backend`を設定する。これらは`frontend/.env.example`の既定値であり、`make dev`の初回実行時に`.env.local`へコピーされる。
フロントエンドは`POST /api/v1/auth/dev`から通常のHttpOnly Cookieセッションを取得し、`VITE_DEV_USER`（`demo-a`〜`demo-c`）に対応する開発用ユーザーとしてローカルAPIへ接続する。
`make dev`はマイグレーション後にこの認証用データとサンプルデータを投入する。
開発用認証エンドポイントは`wrangler.dev.jsonc`と`wrangler.vectorize.dev.jsonc`でのみ有効で、本番設定では無効である。

実際のLINE認証を確認する場合は、`.env.local`の`VITE_DEV_LIFF_MODE`を`false`、`VITE_DEV_AUTH_MODE`を空にし、`VITE_LINE_LIFF_ID`へLIFF IDを設定してから開発サーバーを再起動する。

### CI前のローカル確認

Pull Requestを作成する前に、GitHub Actions相当の確認をまとめて実行できる。

```bash
make check
```

frontendのみは `make check-frontend`、backendのみは `make check-backend` を使う。

`pnpm build` / `pnpm lint` / `pnpm test` はワークスペース全体の基本コマンド、`make check` はformat checkを含むGitHub Actions相当の総合確認として使い分ける。`make check` は、frontendのformat check・lint・buildと、backendのformat check・lint・build・testを順に実行する。

### 環境変数と秘密情報

| 変数 | 用途 | 配置 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | フロントエンドが接続するAPI URL | フロントエンドの環境設定 |
| `VITE_LINE_LIFF_ID` | LINE MINI AppのLIFF ID | フロントエンドの環境設定 |
| `VITE_DEV_LIFF_MODE` | ローカルでLIFF SDKを使わないデバッグモードを有効化 | フロントエンドの環境設定（開発時のみ） |
| `VITE_DEV_AUTH_MODE` | `backend`でローカルAPIの開発用認証を有効化 | フロントエンドの環境設定（開発時のみ） |
| `VITE_DEV_USER` | 開発認証で使う固定ユーザーキー（`demo-a`〜`demo-c`） | フロントエンドの環境設定（開発時のみ） |
| `CORS_ORIGIN` | APIが許可するフロントエンドorigin | Worker環境変数 |
| `LINE_CHANNEL_ID` | LINE IDトークン検証に使うチャネルID | Worker環境変数 |
| `DEV_AUTH_ENABLED` | 開発用認証エンドポイントの有効化 | `wrangler.dev.jsonc` のみ |
| `AUTH_SESSION_TTL_SECONDS` | アプリセッションの有効秒数 | Worker環境変数（任意） |
| `CLOUDFLARE_API_TOKEN` | D1マイグレーションとWorkerデプロイ | GitHub Secret |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflareアカウント識別子 | GitHub Secretまたは環境設定 |
| `AI` (Workers AI binding) | Workers AI 推論 | `backend/wrangler.jsonc` |
| `CONCERN_VECTOR_INDEX` | 投稿Embeddingの近傍照合・upsert | `backend/wrangler.jsonc`（本番）/ `backend/wrangler.vectorize.dev.jsonc`（開発用Vectorize接続） |
| `CONCERN_CLUSTER_SIMILARITY_THRESHOLD` | 既存クラスタを採用する最小類似度 | 本番はGitHub Actions Variable（未設定時 `0.8`）、開発は`wrangler.vectorize.dev.jsonc` |
| `CONCERN_VECTOR_INDEX_VERSION` | 投稿Embeddingの登録先index version | `wrangler.jsonc`（本番）/ `wrangler.vectorize.dev.jsonc`（開発用）。index再作成時に更新 |
| `CONCERN_PROCESSING_QUEUE` | 投稿後のAI処理Queue producer | `backend/wrangler.jsonc` |
| `LINE_CHANNEL_SECRET` | LINE webhookの署名検証 | Worker環境変数またはSecret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEクイズ配信 | Worker環境変数またはSecret |
| `E2E_BASE_URL` | E2Eテスト対象のWeb URL | GitHub Actions Secretまたは環境設定 |

### CIとPR

- PRでは、変更したパッケージに応じてlint、build、testを実行する
- D1スキーマを変更した場合はDrizzleのmigrationを同じ変更に含める
- API仕様を変更した場合は、バックエンドとフロントエンドの型検査を同時に行う
- 投稿からクイズ回答までのE2EテストをPRまたはデモ前のCIで実行する
- mainへ直接pushせず、機能単位のブランチとPRを使う
- PR本文には変更内容と確認したコマンドを記載する

### ログと監視

- `/health` でWorkerとD1の疎通を確認する
- リクエストのメソッド、パス、ステータス、処理時間を構造化ログへ記録する
- 投稿本文、属性、IPアドレス、トークンはログへ含めない
- AI、翻訳、音声認識、LINE配信の成功数、失敗数、処理時間を本文なしで確認できるようにする

### コスト

ハッカソン期間は無料枠または低額で動作する構成を優先する。Workers AI はモデルごとの利用量に応じて課金され、現行の無料枠はアカウント全体で1日10,000 Neuronsまで。Freeプランでは上限超過後の推論が失敗し、Workers Paidでは無料枠を超えた分が課金される。Neuron数や単価はモデルによって異なるため、[公式料金表](https://developers.cloudflare.com/workers-ai/platform/pricing/)を確認する。

Application層からは、原文からの英訳・ひらがな変換用の `TextTranslator`、Embedding用の `TextEmbeddingGenerator`、クラスタ表示文用の `ConcernClusterSummaryGenerator`、音声認識用の `SpeechRecognizer` Portを呼び出す。PoCの英訳・ひらがな変換・クラスタ要約は `@cf/meta/llama-3.1-8b-instruct-fp8` を使い、Embeddingは1024次元の `@cf/qwen/qwen3-embedding-0.6b` を使う。PLaMo-Embedding-1Bは2048次元のためVectorizeの上限に収まらない。各PortのWorkers AI Adapterへ `env.AI` を注入する。投稿保存後は `CONCERN_PROCESSING_QUEUE` へメッセージを送り、Queue consumerから `ConcernProcessingUseCase` を呼び出す。処理結果の表現とcluster IDはD1へ、EmbeddingはCloudflare Vectorizeへ保存する。Vectorizeにはローカルシミュレーターがないため開発用・本番用に別のindexを作成する。通常の `pnpm dev` はWorkers AIとVectorizeのremote bindingを使わず、Cloudflare認証なしでローカルアダプタを動かす。Vectorize連携の開発確認には `pnpm --filter backend dev:vectorize` を使い、開発用remote indexだけに接続する。

新しく作られたpending clusterだけ、最大10件の公開済み悩みからlabelとsummaryを一度生成する。Workers AIへ送る本文は1件あたり2000文字までに切り詰める。生成前にD1の条件付き更新でclusterを`generating`へ原子的にclaimし、同じclusterに対する同時Queue配信の重複推論を防ぐ。別workerが生成中のclusterに当たった配信は投稿をreadyにせず、Queueで再試行する。claim後のD1読み込みや生成に失敗した場合はclaimの解放を試みてQueue再試行を行い、公開済み原文は保持する。claimは5分で失効し、Worker停止後も再投入で回復できる。生成結果はJSON形式でlabelとsummaryだけを含み、両方が空でないことを検証する。出力文の長さ・個人情報・禁止語のパターン検査は行わず、プロンプトで連絡先、URL、個人名、住所、攻撃的・差別的な表現を出さないよう指示する。既存クラスタに投稿が追加されたときの再生成は次の処理で実装する。

Cloudflareアカウントに以下のindexを事前に作成する。dimensionsはEmbedding modelの出力次元に合わせ、metricは `cosine` とする。初回のみ、開発・本番のCloudflareアカウントで個別に実行する。

| 環境 | Vectorize index |
| --- | --- |
| 開発 | `58-hackathon-concern-vectors-dev` |
| 本番 | `58-hackathon-concern-vectors` |

```bash
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors-dev --dimensions=1024 --metric=cosine
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors --dimensions=1024 --metric=cosine
```

`pnpm --filter backend dev:vectorize` はremote Vectorizeへの接続にCloudflareログインを使い、Workers AI推論には接続せず1024次元の決定的なローカルEmbeddingを使う。実際のWorkers AI推論も確認する場合は `wrangler login` 後に `pnpm --filter backend exec wrangler dev`（本番用 `wrangler.jsonc`）を使う。この設定は本番indexを参照するため、通常の開発には使わない。Workers AIの利用量とVectorizeの使用量が発生する環境では、モデル呼び出しとテスト投稿を必要な回数に制限し、Cloudflareダッシュボードで使用量を確認する。Vitestは `wrangler.test.jsonc` を使い、実AIおよびVectorize bindingなしのローカル環境でFakeを使う。LINE配信の宛先と回数もデモ用に制限する。

Queueは `max_batch_size=1`、`max_retries=3` で開始し、AI障害時はメッセージ単位で再試行する。初回デプロイ前に `wrangler queues create 58-hackathon-concern-processing` を実行する。

### 既存投稿のVectorizeバックフィル

Vectorize導入前に `ready` になった投稿は、初回デプロイ後に一度バックフィルする。バックフィルはEmbedding version未登録、または指定したmodel/index versionと異なる投稿を既存のQueueへ再投入し、通常の `ConcernProcessingUseCase` で処理する。表現済みの投稿は既存表現を再利用する。index再作成やEmbedding model変更後にも同じコマンドを実行し、新しいindexへ過去のベクトルを再登録する。

Cloudflare API tokenに `D1 Read`、`D1 Write`、`Queues Read`、`Queues Write` の権限を付与し、次の環境変数を設定する。これはデプロイ済みの本番Workerに対するバックフィルCLIの設定であり、通常の開発環境の起動には不要。`CLOUDFLARE_D1_DATABASE_ID` は `wrangler.jsonc` の `database_id`、queueは `58-hackathon-concern-processing` を使う。

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_D1_DATABASE_ID=...
export CONCERN_VECTOR_EMBEDDING_VERSION='@cf/qwen/qwen3-embedding-0.6b@production-v1'
pnpm --filter backend vectorize:backfill
pnpm --filter backend vectorize:backfill -- --apply
```

`CONCERN_VECTOR_EMBEDDING_VERSION` には、再処理を担当するデプロイ済みWorkerが使う `<modelVersion>@<CONCERN_VECTOR_INDEX_VERSION>` を指定する。上記は本番用Workers AIの例。バックフィルCLIはCloudflare API経由でremote D1とQueueを使うため、WranglerのローカルQueueを使う `dev:vectorize` の処理には接続できない。開発環境ではこのCLIを使った既存投稿のバックフィルは行わない。引数なしでは未登録または指定versionと不一致の対象件数だけを表示する。`--apply` を指定すると投稿ごとに処理状態をclaimしてQueueへ送る。HTTP応答が不明な中断に備え、30分以上 `processing` のままか、`ready` / `failed` でEmbedding versionが未登録または指定versionと異なる投稿は再実行対象になる。Queueの再試行上限を超えた失敗投稿はこのコマンドを再実行して再投入できる。


## 実装前に決める事項

以下は要件の骨格ではなく、デモ実装開始前にチームで決める具体的な選択肢である。

- 正式なアプリ名と、画面で使う「悩み」「困りごと」などの用語
- AI、翻訳、音声認識サービスの提供元、送信する本文、利用量の上限
- クラスタリングをリアルタイム、遅延処理、事前生成のどれで行うか
- LINE公式アカウントのチャネル、Webhook設定、一斉配信の実行手順
- 音声認識、読み上げ、英語翻訳、ひらがな変換の実装方式
- E2Eテストの実行環境、テストユーザー、デモデータのリセット手順
- デモ終了時の投稿保存期間と削除手順


## 実装ロードマップ

### Phase 0 開発基盤

- 投稿、リアクション、既読を表すD1 schemaとmigrationを追加する
- Application、Infrastructure、Presentationのレイヤーを既存のHealth機能と同じ方針で追加する
- Hono RPCでAPI型を共有する
- 投稿APIの単体テストとAPIテストを追加する

### Phase 1 MVP

- 通常ブラウザ用の公開フィード・投稿詳細と、LINEミニアプリのLINEログイン導線を作る
- LINEログイン済み利用者向けの投稿フォーム、フィード、投稿詳細を作る
- LINEログイン済み利用者向けのリアクションと入力エラーを実装する
- モバイル表示とキーボード操作を確認する

### Phase 2 デモ必須機能

- クラスタリングAdapterと非同期処理を追加する
- クラスタ表示と推薦フィードを追加する
- 音声入力、読み上げ、ひらがな表示、英語翻訳を追加する
- 3ユーザー対応付けクイズと学習履歴を追加する
- デモデータとデモ当日のリセット手順を用意する

### Phase 3 LINE連携と完成確認

- LINEの友だち登録イベントとLIFFのLINEログインを接続する
- デイリークイズのURLを友だちへ一斉配信する
- E2Eテスト、フォールバック、保存データ削除手順を確認する
