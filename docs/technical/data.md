# 目安箱 データモデル

LINEミニアプリ（LIFF）を入口とし、認証済みの LINE ユーザーが投稿・閲覧・クイズ・学習履歴を利用するための永続化データを定義する。

## データ要件

### エンティティ

| エンティティ | 主な項目 | 用途 |
| --- | --- | --- |
| `users` | id、line_user_id_hash、friend_status、作成日時、友だち状態日時 | 検証済み LINE ユーザーと内部 user_id の対応。LINE user ID の生値は保存しない |
| `concerns` | id、user_id、原文、入力経路、属性、公開状態、処理状態、日時 | 悩み本体。公開画面では投稿者を特定できる情報を表示しない |
| `concern_clusters` | id、表示ラベル、要約、状態、日時 | 意味の近い悩みのまとまり |
| `concern_representations` | concern_id、言語、本文、生成状態、日時 | ひらがな表示と英語翻訳 |
| `concern_reactions` | concern_id、user_id、種類、日時 | ユーザー単位のリアクションの重複防止と集計 |
| `concern_views` | concern_id、user_id、日時 | 既読と推薦に利用 |
| `quizzes` | id、対象日、状態、作成日時 | デイリークイズ |
| `quiz_participants` | quiz_id、user_id、concern_id、属性、表示順 | クイズに登場する3ユーザー |
| `quiz_options` | quiz_id、concern_id、表示順 | 順番を混ぜて表示する3件の実投稿 |
| `quiz_attempts` | id、quiz_id、user_id、得点、回答日時 | ユーザー単位の回答と二重回答防止 |
| `learning_events` | user_id、concern_id、cluster_id、quiz_id、イベント種別、日時 | 閲覧、リアクション、クイズ回答の履歴 |
| `line_broadcasts` | id、quiz_id、冪等キー、状態、実行日時 | 全友だち向けの一斉配信を一日一回単位で記録 |
| `line_broadcast_attempts` | broadcast_id、試行番号、HTTP状態、LINE request ID、日時 | LINE Broadcast API の呼び出しと再試行を記録。受信者別の行は作らない |

### LINEユーザーと認証

- 全ユーザーは LINE ミニアプリから LIFF 認証を完了して API を利用する。
- フロントエンドは ID token を `Authorization: Bearer <ID_TOKEN>` で送信し、バックエンドは LINE Login v2.1 の Verify ID token API で検証する。
- 検証済み token の subject から `users.id` を解決し、リクエスト本文の `user_id` は信頼しない。
- `line_user_id_hash` にはサーバー秘密鍵による HMAC 値を保存し、ID token、アクセストークン、LINE user ID の生値は保存・ログ出力しない。
- LINE webhook は署名検証後に同じ `users` へ紐付ける。日次一斉配信の内部 endpoint はエンドユーザー認証ではなく内部認証を使う。

### 投稿の状態

投稿は、公開状態と処理状態を分けて持つ。

- 公開状態: `pending`、`published`、`hidden`、`deleted`
- 処理状態: `not_started`、`transcribing`、`translating`、`clustering`、`ready`、`failed`

投稿の保存が成功した後に文字起こし、翻訳、クラスタリングのいずれかが失敗しても、原文の投稿は失わず、その処理だけ未完了として閲覧できるようにする。

### 属性の扱い

- 年齢は年代などの広い区分で保存し、正確な年齢を保存しない。
- 性別は任意入力とし、回答しない選択肢を用意する。
- 地域はユーザーが選択した都道府県または広域区分のみを保存する。
- クイズの3ユーザーは異なる `user_id` から選び、表示時には属性だけを利用する。
- クイズでは未入力の属性を「回答しない」として扱い、個人を特定できる組み合わせを避ける。
- IPアドレスを生データとして保存せず、GPSやIPから地域を推定しない。

### 保存、削除、匿名化

- 投稿本文、属性、リアクション、学習履歴はデモ期間中に必要な範囲で保存する。
- 公開画面では LINE user ID、内部 user_id、個人を特定できる属性を表示しない。
- ユーザーが削除を要求した投稿は公開対象から直ちに除外する。
- `users.deleted_at` が設定されたユーザーは、本人の学習履歴を API から参照できないようにする。
- 生の音声、画像、IPアドレス、LINEアクセストークンは保存しない。
- デモ終了時に投稿、翻訳、学習履歴、LINE連携情報を削除できる手順を用意する。