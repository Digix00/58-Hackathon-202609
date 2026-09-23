# 目安箱 データモデル

永続化するデータ、状態、匿名化、保存・削除方針を定義する。

## データ要件

### エンティティ

| エンティティ | 主な項目 | 用途 |
| --- | --- | --- |
| `concerns` | id、user_id、原文、属性、公開状態、処理状態、日時 | 悩み本体 |
| `concern_clusters` | id、表示ラベル、要約、状態、日時 | 意味の近い悩みのまとまり |
| `concern_representations` | concern_id、言語、本文、生成状態、日時 | ひらがな表示と英語翻訳 |
| `concern_processing_jobs` | id、concern_id、処理種別、状態、試行回数 | 翻訳・ひらがな化・クラスタリングなどの非同期処理 |
| `concern_reactions` | concern_id、user_id、reaction_type、created_at | リアクションの重複防止と集計 |
| `concern_views` | concern_id、actor_key、viewed_at | ユーザーごとの既読記録。concern_id と actor_key の組で一意 |
| `quizzes` | id、対象日、状態、作成日時 | デイリークイズ |
| `quiz_participants` | id、quiz_id、user_id、concern_id、属性スナップショット、表示順 | クイズに登場する3ユーザー |
| `quiz_options` | quiz_id、concern_id、表示順 | 順番を混ぜて表示する3件の実投稿 |
| `quiz_attempts` | id、quiz_id、user_id、score、answered_at | ユーザーごとの回答試行 |
| `quiz_answers` | attempt_id、quiz_id、participant_id、selected_concern_id、is_correct | 対応付け回答の明細 |
| `users` | id、LINE user ID、生年月（年・月）、性別、都道府県、日時 | LINE配信とユーザー単位の履歴 |
| `learning_events` | id、user_id、concern_id、cluster_id、quiz_id、event_type、occurred_at | 閲覧・リアクション・クイズの履歴 |

`user_id` はサーバーがLINEログイン済みセッションから解決する内部の `users.id` であり、リクエストから受け取らない。`concern_views.actor_key` にもこの内部 ID を保存し、LINE user ID は保存しない。通常ブラウザおよび未ログインのLINEミニアプリによる公開投稿の閲覧では、`user_id`、既読、リアクション、クイズ回答、学習イベントを記録しない。

### 投稿の状態

投稿は、公開状態と処理状態を分けて持つ。

- 公開状態: `pending`、`published`、`hidden`、`deleted`
- 処理状態: `not_started`、`transcribing`、`translating`、`clustering`、`ready`、`failed`

投稿の保存が成功した後に文字起こし、翻訳、クラスタリングのいずれかが失敗しても、原文の投稿は失わず、その処理だけ未完了として閲覧できるようにする。

### 属性の扱い

- 生年月は年と月だけを保存し、日や正確な年齢は保存しない
- 年齢は年代などの広い区分で保存し、正確な年齢を保存しない
- ユーザープロフィールの性別は `male`、`female`、`non_binary`、`other`、`no_answer` のいずれかで保存する
- ユーザープロフィールの地域は47都道府県コードから選択して保存する
- 初回ログイン直後のプロフィールは未入力を許容し、性別の `no_answer` は入力済みとして扱う
- クイズの3ユーザーは異なる `user_id` から選び、表示時には属性だけを利用する
- クイズでは未入力の属性を「回答しない」として扱い、個人を特定できる組み合わせを避ける
- IPアドレスを生データとして保存しない
- GPSやIPから地域を推定しない

### 保存、削除、匿名化

- 投稿本文、属性、リアクション、学習履歴はデモ期間中に必要な範囲で保存する
- ユーザーが削除を要求した投稿は公開対象から直ちに除外する
- 生の音声、画像、IPアドレス、LINEアクセストークンは保存しない
- デモ終了時に投稿、翻訳、学習履歴、LINE連携情報を削除する
