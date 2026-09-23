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
| AIサービスのAPIキー | クラスタリング、翻訳、音声認識 | Worker環境変数またはSecret |
| `LINE_CHANNEL_SECRET` | LINE webhookの署名検証 | Worker環境変数またはSecret |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEクイズ配信 | Worker環境変数またはSecret |
| `E2E_BASE_URL` | E2Eテスト対象のWeb URL | GitHub Actions Secretまたは環境設定 |

### CIとPR

- すべてのPRでは、変更された領域に対応するbackend/frontendのlint・build・testとReact Doctorを実行し、`main`または`develop`へのpush後も各workflowの`paths`に該当する場合だけ同じCIを実行する。Required check対象のjobは、変更がない場合もjob単位でskipして成功として完了する。マージ必須のRequired checkは、GitHub Rulesetで`develop`向けPRにだけ設定する
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

ハッカソン期間は無料枠または低額で動作する構成を優先する。AI、翻訳、音声認識の呼び出しは投稿ごとに無制限に実行せず、クラスタ単位、バッチ単位、またはデモ用データ単位で回数を制限する。LINE配信の宛先と回数もデモ用に制限し、課金が発生する外部サービスを採用する場合は、利用量の上限と停止方法をREADMEへ記載する。


## 実装前に決める事項

以下は要件の骨格ではなく、デモ実装開始前にチームで決める具体的な選択肢である。

- 正式なアプリ名と、画面で使う「悩み」「困りごと」などの用語
- リアクションの名称と種類。MVPでは一種類にするか
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
