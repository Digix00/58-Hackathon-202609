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
| `CORS_ORIGIN` | APIが許可するフロントエンドorigin | Worker環境変数 |
| `LINE_CHANNEL_ID` | LINE IDトークン検証に使うチャネルID | Worker環境変数 |
| `AUTH_SESSION_TTL_SECONDS` | アプリセッションの有効秒数 | Worker環境変数（任意） |
| `CLOUDFLARE_API_TOKEN` | D1マイグレーションとWorkerデプロイ | GitHub Secret |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflareアカウント識別子 | GitHub Secretまたは環境設定 |
| `AI` (Workers AI binding) | Workers AI 推論 | `backend/wrangler.jsonc` |
| `CONCERN_VECTOR_INDEX` | 投稿Embeddingの近傍照合・upsert | `backend/wrangler.jsonc`（本番）/ `backend/wrangler.dev.jsonc`（開発用） |
| `CONCERN_CLUSTER_SIMILARITY_THRESHOLD` | 既存クラスタを採用する最小類似度 | 本番はGitHub Actions Variable（未設定時 `0.8`）、開発は`wrangler.dev.jsonc` |
| `CONCERN_VECTOR_INDEX_VERSION` | 投稿Embeddingの登録先index version | `wrangler.jsonc`（本番）/ `wrangler.dev.jsonc`（開発用）。index再作成時に更新 |
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

Application層からは、原文からの英訳・ひらがな変換用の `TextTranslator`、Embedding用の `TextEmbeddingGenerator`、音声認識用の `SpeechRecognizer` Portを呼び出す。PoCの翻訳2方向は `@cf/meta/llama-3.1-8b-instruct-fp8` 1つに統一し、Embeddingは1024次元の `@cf/qwen/qwen3-embedding-0.6b` を使う。PLaMo-Embedding-1Bは2048次元のためVectorizeの上限に収まらない。各PortのWorkers AI Adapterへ `env.AI` を注入する。投稿保存後は `CONCERN_PROCESSING_QUEUE` へメッセージを送り、Queue consumerから `ConcernProcessingUseCase` を呼び出す。処理結果の表現とcluster IDはD1へ、EmbeddingはCloudflare Vectorizeへ保存する。Vectorizeにはローカルシミュレーターがなく、開発用・本番用に別のindexを作成する。ローカル開発では `backend/wrangler.dev.jsonc` が開発用indexへremote接続し、`pnpm dev` がこの設定を使う。

Cloudflareアカウントに以下のindexを事前に作成する。dimensionsはEmbedding modelの出力次元に合わせ、metricは `cosine` とする。初回のみ、開発・本番のCloudflareアカウントで個別に実行する。

| 環境 | Vectorize index |
| --- | --- |
| 開発 | `58-hackathon-concern-vectors-dev` |
| 本番 | `58-hackathon-concern-vectors` |

```bash
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors-dev --dimensions=1024 --metric=cosine
pnpm --filter backend exec wrangler vectorize create 58-hackathon-concern-vectors --dimensions=1024 --metric=cosine
```

`wrangler dev` からのWorkers AI推論とremote Vectorize bindingはCloudflareアカウントへ接続する。AI利用量とVectorizeの使用量が発生するため、開発時はモデル呼び出しとテスト投稿を必要な回数に制限し、Cloudflareダッシュボードで使用量を確認する。Vitestは `wrangler.test.jsonc` を使い、実AIおよびVectorize bindingなしのローカル環境でFakeを使う。クラスタリング、翻訳、音声認識の呼び出しは投稿ごとに無制限に実行しない。LINE配信の宛先と回数もデモ用に制限する。

Queueは `max_batch_size=1`、`max_retries=3` で開始し、AI障害時はメッセージ単位で再試行する。初回デプロイ前に `wrangler queues create 58-hackathon-concern-processing` を実行する。

### 既存投稿のVectorizeバックフィル

Vectorize導入前に `ready` になった投稿は、初回デプロイ後に一度バックフィルする。バックフィルはEmbedding version未登録の投稿を既存のQueueへ再投入し、通常の `ConcernProcessingUseCase` で処理する。表現済みの投稿は既存表現を再利用する。

Cloudflare API tokenに `D1 Read`、`D1 Write`、`Queues Read`、`Queues Write` の権限を付与し、次の環境変数を設定する。`CLOUDFLARE_D1_DATABASE_ID` は `wrangler.jsonc` の `database_id`、queueは `58-hackathon-concern-processing` を使う。

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_D1_DATABASE_ID=...
pnpm --filter backend vectorize:backfill
pnpm --filter backend vectorize:backfill -- --apply
```

引数なしでは対象件数だけを表示する。`--apply` を指定すると投稿ごとに処理状態をclaimしてQueueへ送る。HTTP応答が不明な中断に備え、30分以上 `processing` のままか、`ready` / `failed` でEmbedding versionが未登録の投稿は再実行対象になる。Queueの再試行上限を超えた失敗投稿はこのコマンドを再実行して再投入できる。


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
