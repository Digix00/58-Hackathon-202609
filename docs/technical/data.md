# 目安箱 データモデル

永続化するデータ、状態、匿名化、保存・削除方針を定義する。

## データ要件

### エンティティ

| エンティティ | 主な項目 | 用途 |
| --- | --- | --- |
| `concerns` | id、user_id、原文、属性、公開状態、処理状態、cluster_id、embedding_version、日時 | 悩み本体とVectorize登録version |
| `concern_clusters` | id、表示ラベル、要約、状態、Embedding model version、日時 | 意味の近い悩みのまとまり。状態はpending/generating/ready。生成中のlease時刻はupdated_atに保存し、期限切れ後は再claimできる |
| `concern_representations` | concern_id、言語、本文、生成状態、日時 | ひらがな表示と英語翻訳 |
| `concern_processing_jobs` | id、concern_id、処理種別、状態、試行回数 | 翻訳・ひらがな化・クラスタリングなどの非同期処理 |
| `concern_reactions` | concern_id、user_id、reaction_type、created_at | リアクションの重複防止と集計 |
| `concern_views` | concern_id、actor_key、viewed_at | ユーザーごとの既読記録。concern_id と actor_key の組で一意 |
| `quizzes` | id、対象日、状態、作成日時 | デイリークイズ |
| `quiz_participants` | id、quiz_id、user_id、concern_id、属性スナップショット、表示順 | クイズに登場する3ユーザー |
| `quiz_options` | quiz_id、concern_id、表示順 | 順番を混ぜて表示する3件の実投稿 |
| `quiz_attempts` | id、quiz_id、user_id、score、answered_at | ユーザーごとの回答試行 |
| `quiz_answers` | attempt_id、quiz_id、participant_id、selected_concern_id、is_correct | 対応付け回答の明細 |
| `users` | id、LINE user ID、表示形式、生年月（年・月）、性別、都道府県、日時 | LINE配信、表示形式の保存、ユーザー単位の履歴。表示形式は original、jaHira、en |
| `speech_transcription_rate_limit_events` | id、user_id、created_at | 音声文字起こしのユーザー単位レート制限。音声や文字起こし結果は保存しない |
| `learning_events` | id、user_id、concern_id、cluster_id、quiz_id、event_type、occurred_at | 閲覧・リアクション・クイズの履歴 |

`user_id` はサーバーがLINEログイン済みセッションから解決する内部の `users.id` であり、リクエストから受け取らない。`concern_views.actor_key` にもこの内部 ID を保存し、LINE user ID は保存しない。通常ブラウザおよび未ログインのLINEミニアプリによる公開投稿の閲覧では、`user_id`、既読、リアクション、クイズ回答、学習イベントを記録しない。

投稿EmbeddingはD1へ保存せず、Cloudflare Vectorizeのconcern indexへ保存する。VectorizeのIDはconcern ID、metadataはcluster IDのみとする。D1の `concerns.cluster_id` を正とし、投稿の処理状態がreadyになるまでフィード上のcluster割当を公開しない。`clusterId` 指定のフィード検索も `processing_status = 'ready'` の投稿だけを対象とする。`concerns.embedding_version` にはEmbeddingモデル名と環境別index versionを記録し、未登録またはversionが変わった投稿をQueue再処理時に再登録する。Vectorizeは非同期クラスタリングの内部検索専用であり、利用者向けの自由入力検索やRAGには使わない。

### 投稿の状態

投稿は、公開状態と処理状態を分けて持つ。

- 公開状態: `pending`、`published`、`hidden`、`deleted`
- 処理状態: `pending`、`processing`、`ready`、`failed`

投稿の保存が成功した後に文字起こし、翻訳、クラスタリングのいずれかが失敗しても、原文の投稿は失わず、その処理だけ未完了として閲覧できるようにする。

### 属性の扱い

- 生年月は年と月だけを保存し、日や正確な年齢は保存しない
- 年齢は年代などの広い区分で保存し、正確な年齢を保存しない
- ユーザープロフィールの性別は `male`、`female`、`non_binary`、`other`、`no_answer` のいずれかで保存する
- ユーザープロフィールの都道府県は47都道府県コードから選択して保存する
- 都道府県コードはアプリケーションコードで定義し、`regions` のようなマスタテーブルは持たない
- 都道府県の表示名はコードと表示形式からアプリケーションコードで決定し、投稿データに翻訳名を複製しない
- 認証済みユーザーの表示形式は `users.display_language` に保存し、初期値は `original` とする
- 初回ログイン直後のプロフィールは未入力を許容し、性別の `no_answer` は入力済みとして扱う
- クイズの3ユーザーは異なる `user_id` から選び、表示時には属性だけを利用する
- クイズの3件は、年代・性別・都道府県コードの各属性がすべて重複しない組み合わせにする。未入力の属性は `no_answer` として扱い、ヒントとして機能するようにする
- IPアドレスを生データとして保存しない
- GPSやIPから地域を推定しない

### 保存、削除、匿名化

- 投稿本文、属性、リアクション、学習履歴はデモ期間中に必要な範囲で保存する
- ユーザーが削除を要求した投稿は公開対象から直ちに除外する
- 生の音声、画像、IPアドレス、LINEアクセストークンは保存しない
- 音声レート制限には内部 `users.id` と受付時刻だけを記録し、直近24時間より古い記録はレート制限判定時に削除する
- デモ終了時に投稿、翻訳、学習履歴、LINE連携情報を削除する
