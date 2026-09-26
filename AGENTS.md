read AGENTS.md

# エージェント向け開発ガイド

このファイルは、リポジトリで作業する AI エージェントおよび開発者が守るべき共通ルールを定義する。作業を開始する前に必ず最後まで読み、作業対象に関係する設計・要件・運用ドキュメントも確認すること。

## 1. 基本方針

- ユーザーの依頼、このファイル、既存のプロジェクトドキュメント、実装の順に確認し、矛盾がある場合は上位の指示を優先する。
- リポジトリ内の Markdown（`.md`）を読み込んだら、読み込み完了後に必ず `read agents.md` と出力する。
- 推測で仕様を補わない。要件や実装が一致しない場合は、まず現在のコードとドキュメントを調べ、影響が大きい判断だけをユーザーへ確認する。
- 依頼された範囲を超えて、無関係なリファクタリング、依存関係の更新、設定変更、ファイル削除を行わない。
- 既存の未コミット変更をユーザーの作業として扱い、上書き、破棄、巻き戻しをしない。変更が重なる場合は、対象を分けて確認する。
- 説明、計画、結果報告、コメントは日本語で書く。コマンド、パス、識別子、ライブラリ名、API の固有名詞は原文の表記を維持してよい。
- 実装を変更した場合は、変更理由と確認したコマンドを最後に簡潔に報告する。確認できなかったことは、確認できなかったと明記する。

## 2. リポジトリの全体像

このリポジトリは `pnpm` workspace のモノレポである。

| パス | 役割 | 主な技術 |
| --- | --- | --- |
| `frontend/` | ブラウザ向け画面 | React、Vite、TypeScript、Cloudflare Workers Static Assets |
| `backend/` | HTTP API と永続化 | Hono、Cloudflare Workers、D1、Drizzle ORM |
| `docs/` | 要件、設計、開発・運用方針、作業手順 | Markdown |
| `.github/` | CI、デプロイ、Pull Request の運用 | GitHub Actions |
| `.agents/skills/` | エージェント用の再利用可能な作業手順 | Markdown、補助スクリプト |

プロダクトの詳細な要件は `docs/requirements/product.md`、技術的な前提は `docs/technical/`、日々の開発・運用手順は `docs/technical/development.md` と `docs/workflows/` を正とする。

フロントエンドの実装方針・画面設計を確認するときは、`docs/requirements/design-guidelines.md`、`docs/requirements/screens.md`、`docs/requirements/screens/` を参照する。これらのドキュメントが存在しない場合も、画面実装の判断に必要な内容を追加する前に、要件や既存の設計方針との整合性を確認する。

## 3. 作業開始時に読むもの

作業の最初に、次の順で確認する。すべてを毎回精読する必要はないが、変更対象に関係する資料は必ず読むこと。

1. `README.md`
2. `docs/README.md`
3. `docs/requirements/product.md`
4. `docs/technical/architecture.md`
5. `docs/technical/frontend.md`、`docs/technical/api.md`、`docs/technical/data.md`、`docs/technical/development.md` のうち関係するもの
6. `backend/README.md` または `frontend/README.md`
7. 対象ディレクトリの実装、テスト、設定ファイル
8. 変更に関係する `.github/`、`.agents/` の手順

既存のドキュメントに書かれていない仕様を実装する場合は、実装だけで終わらせず、必要な設計・API・データ・開発ドキュメントの更新も変更範囲に含める。

## 4. よく使うコマンド

コマンドはリポジトリのルートで実行する。依存関係を勝手に更新せず、通常は既存の `pnpm-lock.yaml` を尊重する。

### 共通

```bash
pnpm install
make dev
make backend
make frontend
make db-migrate
pnpm build
pnpm lint
pnpm test
```

`make dev` は依存関係の導入、ローカル D1 のマイグレーション、バックエンドとフロントエンドの同時起動を行う。通常の開発ではバックエンドが `http://localhost:8787`、フロントエンドが `http://localhost:5173` で起動する。D1 のために独立したデータベースサーバーを起動しない。

### パッケージ単位

```bash
pnpm --filter backend lint
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter backend db:generate
pnpm --filter backend db:migrate:local
pnpm --filter frontend lint
pnpm --filter frontend build
```

バックエンドのテストは `vitest` と `@cloudflare/vitest-pool-workers` によりローカル D1 をエミュレートする。フロントエンドのビルドは TypeScript の型検査と Vite のビルドを兼ねる。

## 5. バックエンドの設計規約

### レイヤーと依存方向

依存方向を `presentation` → `application` → `infrastructure` の一方向に保つ。Application 層が Hono、D1、Drizzle、外部サービスの具体実装へ直接依存してはならない。

- `backend/src/presentation/`: HTTP の入力、レスポンス、ルートへの接続を担当する。
- `backend/src/application/`: ユースケース、Repository などの Port を担当する。
- `backend/src/application/entity/`: ドメインや機能の状態・不変条件を表す Entity を担当する。今後、機能追加に伴う Entity が増えることを前提に、HTTP、D1、外部サービスの詳細を持ち込まない。
- `backend/src/infrastructure/`: D1、Drizzle、AI、翻訳、音声認識、LINE などの Adapter を担当する。
- `backend/src/bootstrap/container.ts`: 具象クラスを知る唯一の Composition Root とし、依存グラフを組み立てる。
- `backend/src/app/`: Hono アプリ、共通ミドルウェア、エラーハンドラーを担当する。

機能を追加するときは、既存の Health 機能と同じく、Entity、Port、UseCase、Adapter、Handler、Composition Root の責務を分離する。Entity には業務上の状態と不変条件を置き、HTTP や永続化の都合を持たせない。リクエストごとに Repository や UseCase を生成せず、Worker のモジュール初期化時に依存関係を構築する。

### Entity・Repository・UseCase の実装規約

- Repository の入出力は Entity をそのまま渡す。`InsertXxxInput` のような Repository 専用の入力型を新設しない。ただし、トークンハッシュのように永続化にのみ必要で、アプリケーション層の Entity に持たせるべきでない秘密情報がある場合はこの限りではない。
- バリデーションは責務で分ける。Handler は HTTP リクエストの構造（型・必須項目）だけを検証し、本文の文字数上限や属性値の妥当性のようなドメインルールは Entity のコンストラクタまたはファクトリで検証する。Entity は不変条件に違反した場合に専用のドメインエラー（例: `ConcernValidationError`）を投げ、Handler がそれを捕捉してエラーレスポンスへ変換する。
- UseCase はドメイン（機能）単位で 1 つのクラス・ファイルにまとめる。ファイル名とクラス名はドメイン名を用いる（例: `auth.usecase.ts` の `AuthUseCase`、`concern.usecase.ts` の `ConcernUseCase`）。操作（作成・更新など）ごとにファイルを分割しない。
- 既存の実装にある汎用的なロジック（ID 生成など）は再利用してよい。ただし、機能をまたいで UseCase 同士が直接 import し合う実装は避け、複数機能から使う横断的なロジックは `backend/src/application/shared/` のような独立した場所へ切り出す。こうした設計改善のための小さなリファクタリングは、依頼された変更の一部として行ってよい。

### API と Hono RPC

- API のルートは `/api/v1` とし、運用監視用の `GET /health` は維持する。
- Hono RPC の型をフロントエンドへ共有するため、ルートをチェーンした式で定義し、`AppType` が正確なルート型を保持できるようにする。
- 入力はサーバー側でも検証する。クライアント側の検証だけを信頼しない。
- エラーは `code`、`message`、`requestId` を含む共通形式を基本とする。既存形式との互換性を壊す場合は、API 仕様と利用側を同時に更新する。
- 投稿、リアクション、既読、クイズ回答などの重複登録と過剰利用を考慮する。
- 投稿保存と AI、翻訳、音声認識、LINE 通知などの外部処理を分離する。投稿受付は外部処理の完了を待たず、原文を失わない。

### データベースとマイグレーション

- `backend/src/infrastructure/database/schema.ts`、生成した migration、関連するユースケース・テストを同じ変更単位で扱う。
- スキーマを変更したら `pnpm --filter backend db:generate` を実行し、生成された SQL を確認してコミットに含める。
- ローカルでの確認は `pnpm --filter backend db:migrate:local` を使う。本番 D1 へ適用する `db:migrate:remote` は、明示的なデプロイ作業以外で実行しない。
- 年齢、地域、性別などは個人を特定しにくい粒度で保存し、正確な年齢、住所、GPS、生 IP アドレスを保存しない。
- 生の音声、画像、LINE アクセストークン、API キーを保存しない。デモ終了時の削除方針を維持する。

## 6. フロントエンドの設計規約

- フロントエンドを編集するときは、[LINEミニアプリ固有の挙動とフロントエンド編集ガイド](docs/technical/line-mini-app.md)を必ず読み、通常Webとの利用区分、LIFF初期化・認証、画面遷移、実機確認の条件を確認する。
- API 通信は `frontend/src/lib/api.ts` の Hono RPC クライアントを利用し、バックエンドの型共有を維持する。
- API の接続先は `VITE_API_BASE_URL` で設定し、未設定時のローカル開発用既定値を壊さない。
- 画面の主要操作はキーボードだけで完了できるようにする。
- 入力欄、ボタン、エラー、状態変化に適切な意味づけを行い、色、音、アニメーションだけに状態を依存させない。
- モバイル幅、文字サイズ変更、長い投稿本文、API 失敗時の表示を確認する。
- API 仕様を変更した場合は、バックエンドとフロントエンドの型検査を同じ変更で実行する。

## 7. セキュリティとプライバシー

- 秘密情報をソース、ログ、テスト出力、PR に含めない。
- `backend/.dev.vars`、`frontend/.env`、API キー、LINE の秘密情報、Cloudflare の認証情報をコミットしない。
- 本番 CORS は許可するフロントエンドの origin に限定する。`*` はローカル開発時の既定値としてのみ扱う。
- ログには投稿本文、属性、IP アドレス、アクセストークンを記録しない。メソッド、パス、ステータス、処理時間などの運用に必要な情報だけを記録する。
- LINE webhook は署名を検証し、配信 API は内部認証で保護する。
- 外部サービスの障害時は、原文で投稿・閲覧を継続できるフォールバックを優先する。

## 8. テストと完了条件

変更前に関連する既存テストを確認し、変更後は影響範囲に応じて検証する。

| 変更 | 最低限確認すること |
| --- | --- |
| バックエンドの TypeScript | `pnpm --filter backend lint`、`pnpm --filter backend build` |
| バックエンドの挙動 | `pnpm --filter backend test` |
| フロントエンド | `pnpm --filter frontend lint`、`pnpm --filter frontend build` |
| API 契約 | バックエンドとフロントエンドの型検査、関連テスト |
| D1 スキーマ | `db:generate`、migration の内容確認、関連テスト |
| 画面の見た目・操作 | ローカル起動、主要フロー、キーボード操作、失敗時表示 |
| デプロイ設定 | 対象 workflow と環境変数名の確認。秘密情報は実値を表示しない |

すべてのテストを実行できない場合は、理由、実行した確認、未確認の範囲を報告する。テストが失敗した状態で成功したと報告しない。

## 9. Git と Pull Request

- `main` へ直接コミットまたは push しない。機能単位のブランチと Pull Request を使う。
- ユーザーから明示的に依頼されない限り、コミット、push、Pull Request 作成などの外部状態変更を勝手に行わない。
- 作業開始時と変更前後に `git status --short` を確認し、既存の変更を巻き込まない。
- コミットを作成する場合の形式は `<接頭辞>: <日本語の説明>` とする。接頭辞は `feat`、`fix`、`refactor`、`docs`、`chore`、`test` から選ぶ。
- 1 つのコミットには 1 つの意図をまとめる。機能追加と無関係な整形・リファクタリングを混ぜない。
- Pull Request には概要、変更内容、確認したコマンド、レビュワーに見てほしい点を記載する。既存の `.github/PULL_REQUEST_TEMPLATE.md` に従う。
- このリポジトリでは、Pull Request 作成用の skill を `.agents/skills/create-pull-request/` に整備している。ブランチ名の提案用 skill も `.agents/skills/suggest-branch-name/` に用意しているため、該当する作業では先に各 `SKILL.md` と参照先のワークフローを読む。
- Git の詳細な作業手順が必要な場合は `docs/workflows/create-pull-request/README.md` と `docs/workflows/suggest-branch-name/README.md` を読む。

## 10. ドキュメントの更新

実装とドキュメントが食い違う場合、どちらかを黙って放置しない。次のいずれかを行う。

1. 実装を既存仕様に合わせる。
2. 仕様変更が依頼されている場合は、関連する要件・設計・API・データ・開発ドキュメントを更新する。
3. 判断できない場合は、差分と選択肢をユーザーへ報告して確認する。

このファイルにはプロジェクト全体に適用する安定したルールだけを追加する。特定機能の一時的なメモや作業ログは、適切な `docs/` 配下へ記録する。
