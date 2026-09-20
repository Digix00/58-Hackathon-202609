# SQLite データベース設計

Issue #29「データベース設計」の設計書。  
対象アプリは、匿名の悩みを Web・LINE・音声入力から受け付け、投稿の公開、意味クラスタリング、推薦、クイズ、学習履歴、LINE 配信までを行う。

## 1. 設計の前提

- データベースは Cloudflare D1（SQLite）を使用する。
- 現在の `_health` テーブルは、D1 の疎通確認用として残す。
- ID は API に返しても個人を推測できない、アプリ生成の文字列 ID（ULID など）を使用する。
- 日時は UTC の ISO 8601 文字列を TEXT として保存する。
- 真偽値と件数は SQLite の INTEGER（0 または 1）で保存する。
- SQLite の ENUM は使用せず、TEXT と CHECK 制約で状態値を表現する。
- 正確な年齢、住所、緯度経度、IP アドレス、生音声、LINE のアクセストークンは保存しない。
- 投稿の公開状態と、翻訳・クラスタリングなどの処理状態は別々に管理する。
- 外部 AI や LINE の失敗で、保存済みの原文投稿が失われないことを優先する。

## 2. 全体方針

### 2.1 投稿者を actor として共通化する

投稿、既読、リアクション、クイズ回答、推薦履歴を匿名セッションと LINE ユーザーで共通化するため、すべての主体を actors で表す。

- Web の未ログイン利用者は actors と anonymous_sessions を持つ。
- LINE の友だち登録者は actors と line_users を持つ。
- 投稿や履歴の外部キーは、anonymous_sessions と line_users のどちらかを直接参照せず、actors.id を参照する。
- セッションの有効期限が切れても、公開済み投稿は残せる。期限切れ actor の学習履歴だけを API の対象外にする。

この構成により、投稿・既読・リアクション・クイズ回答ごとに「匿名か LINE か」を表す多態的な外部キーを持たずに済む。

### 2.2 非同期処理はジョブ単位で管理する

翻訳、ひらがな変換、クラスタリング、モデレーションを一つの状態値だけで管理すると、処理が並列に走ったときに状態を正しく表現できない。そのため、concerns.processing_status は API 向けの概要値とし、実際の処理状況は concern_processing_jobs で管理する。

原文は先に保存し、各処理が失敗しても原文の投稿は閲覧可能にする。

### 2.3 クイズは元投稿を参照し、属性はスナップショットする

クイズ参加者には、クイズ生成時点の年代・性別・地域をコピーして保存する。投稿本文は concern_id で元投稿を参照する。

投稿が削除または非公開になったときは、元投稿をクイズ画面に表示できないため、そのクイズを hidden にする。本文のスナップショットを持たせないことで、削除済み投稿がクイズ経由で再表示されることを防ぐ。

## 3. リレーション図

### 3.1 投稿・閲覧・AI処理

```mermaid
erDiagram
  ACTORS ||--o| ANONYMOUS_SESSIONS : "匿名セッション"
  ACTORS ||--o| LINE_USERS : "LINEユーザー"
  ACTORS ||--o{ CONCERNS : "投稿する"
  REGIONS ||--o{ CONCERNS : "地域"
  CONCERN_CLUSTERS ||--o{ CONCERNS : "分類する"
  CONCERNS ||--o{ CONCERN_REPRESENTATIONS : "翻訳・表記"
  CONCERNS ||--o{ CONCERN_PROCESSING_JOBS : "処理する"
  CONCERNS ||--o{ CONCERN_REACTIONS : "リアクション"
  ACTORS ||--o{ CONCERN_REACTIONS : "操作する"
  CONCERNS ||--o{ CONCERN_VIEWS : "閲覧される"
  ACTORS ||--o{ CONCERN_VIEWS : "閲覧する"
  ACTORS ||--o{ LEARNING_EVENTS : "学習履歴"
  CONCERNS ||--o{ LEARNING_EVENTS : "対象になる"
  ACTORS ||--o{ FEED_IMPRESSIONS : "推薦を受ける"
  CONCERNS ||--o{ FEED_IMPRESSIONS : "推薦される"

  ACTORS {
    TEXT id PK
    TEXT kind
    TEXT created_at
    TEXT expires_at
    TEXT deleted_at
  }

  ANONYMOUS_SESSIONS {
    TEXT actor_id PK, FK
    TEXT token_hash UK
    TEXT expires_at
    TEXT last_seen_at
  }

  LINE_USERS {
    TEXT actor_id PK, FK
    TEXT line_user_id_hash UK
    TEXT friend_status
    TEXT joined_at
    TEXT unfollowed_at
  }

  REGIONS {
    TEXT code PK
    TEXT level
    TEXT name_ja
    TEXT name_en
  }

  CONCERNS {
    TEXT id PK
    TEXT actor_id FK
    TEXT region_code FK
    TEXT cluster_id FK
    TEXT body
    TEXT input_method
    TEXT visibility_status
    TEXT processing_status
    TEXT created_at
  }

  CONCERN_CLUSTERS {
    TEXT id PK
    TEXT label
    TEXT summary
    TEXT status
    TEXT model_version
  }

  CONCERN_REPRESENTATIONS {
    TEXT concern_id PK, FK
    TEXT locale PK
    TEXT body
    TEXT status
  }

  CONCERN_PROCESSING_JOBS {
    TEXT id PK
    TEXT concern_id FK
    TEXT job_type
    TEXT status
    INTEGER attempt_count
  }

  CONCERN_REACTIONS {
    TEXT concern_id PK, FK
    TEXT actor_id PK, FK
    TEXT reaction_type
    TEXT created_at
  }

  CONCERN_VIEWS {
    TEXT concern_id PK, FK
    TEXT actor_id PK, FK
    TEXT first_viewed_at
    TEXT last_viewed_at
    INTEGER view_count
  }

  LEARNING_EVENTS {
    TEXT id PK
    TEXT actor_id FK
    TEXT concern_id FK
    TEXT cluster_id FK
    TEXT quiz_id FK
    TEXT event_type
    TEXT occurred_at
  }

  FEED_IMPRESSIONS {
    TEXT id PK
    TEXT actor_id FK
    TEXT concern_id FK
    TEXT strategy
    TEXT reason_code
    TEXT algorithm_version
    INTEGER position
    TEXT exposed_at
    TEXT opened_at
  }
```

### 3.2 クイズ・学習・LINE 配信

```mermaid
erDiagram
  QUIZZES ||--|{ QUIZ_PARTICIPANTS : "3人を含む"
  ACTORS ||--o{ QUIZ_PARTICIPANTS : "参加者"
  CONCERNS ||--o{ QUIZ_PARTICIPANTS : "正解の元投稿"
  QUIZZES ||--|{ QUIZ_OPTIONS : "3件を含む"
  CONCERNS ||--o{ QUIZ_OPTIONS : "選択肢"
  QUIZZES ||--o{ QUIZ_ATTEMPTS : "回答される"
  ACTORS ||--o{ QUIZ_ATTEMPTS : "回答者"
  QUIZ_ATTEMPTS ||--|{ QUIZ_ANSWERS : "回答明細"
  QUIZ_PARTICIPANTS ||--o{ QUIZ_ANSWERS : "対応付け対象"
  CONCERNS ||--o{ QUIZ_ANSWERS : "選択された投稿"
  QUIZZES ||--o{ LINE_BROADCASTS : "配信する"
  LINE_BROADCASTS ||--o{ LINE_BROADCAST_DELIVERIES : "配信明細"
  ACTORS ||--o{ LINE_BROADCAST_DELIVERIES : "配信先"
  ACTORS ||--o{ LINE_WEBHOOK_EVENTS : "LINEイベント"

  QUIZZES {
    TEXT id PK
    TEXT quiz_date UK
    TEXT status
    TEXT title
    TEXT created_at
    TEXT published_at
  }

  QUIZ_PARTICIPANTS {
    TEXT id PK
    TEXT quiz_id FK
    TEXT actor_id FK
    TEXT concern_id FK
    INTEGER display_order
    TEXT age_group_snapshot
    TEXT gender_snapshot
    TEXT region_code_snapshot
    TEXT explanation
  }

  QUIZ_OPTIONS {
    TEXT quiz_id PK, FK
    TEXT concern_id PK, FK
    INTEGER display_order
  }

  QUIZ_ATTEMPTS {
    TEXT id PK
    TEXT quiz_id FK
    TEXT actor_id FK
    INTEGER score
    TEXT answered_at
  }

  QUIZ_ANSWERS {
    TEXT attempt_id PK, FK
    TEXT participant_id PK, FK
    TEXT selected_concern_id FK
    INTEGER is_correct
  }

  LINE_BROADCASTS {
    TEXT id PK
    TEXT quiz_id FK
    TEXT idempotency_key UK
    TEXT status
    TEXT requested_at
    TEXT finished_at
  }

  LINE_BROADCAST_DELIVERIES {
    TEXT quiz_id PK, FK
    TEXT actor_id PK, FK
    TEXT broadcast_id FK
    TEXT status
    INTEGER attempt_count
    TEXT sent_at
  }

  LINE_WEBHOOK_EVENTS {
    TEXT provider_event_id PK
    TEXT actor_id FK
    TEXT event_type
    TEXT status
    TEXT received_at
    TEXT processed_at
  }
```

ER 図における「3人」「3件」は、SQLite のリレーションだけでは件数まで表現できないため、クイズ生成ユースケースのトランザクション内で検証する。

## 4. テーブル定義

### 4.1 主体・地域

| テーブル | 主なカラム | 制約・用途 |
| --- | --- | --- |
| actors | id, kind, created_at, expires_at, deleted_at | kind は anonymous または line。全操作の共通主体 |
| anonymous_sessions | actor_id, token_hash, expires_at, last_seen_at | token_hash は UNIQUE。Cookie の生トークンは保存しない |
| line_users | actor_id, line_user_id_hash, friend_status, joined_at, unfollowed_at, last_seen_at | LINE user ID は秘密鍵付きハッシュを保存。friend_status は active, unfollowed, blocked |
| regions | code, level, name_ja, name_en | 都道府県と広域区分のマスタ。投稿には自由入力文字列を保存しない |

### 4.2 投稿・AI処理

| テーブル | 主なカラム | 制約・用途 |
| --- | --- | --- |
| concerns | id, actor_id, body, input_method, age_group, gender_code, region_code, visibility_status, processing_status, cluster_id, moderation_reason_code, created_at, updated_at, published_at, deleted_at | 悩み本体。input_method は web, line, voice。visibility_status は pending, published, hidden, deleted |
| concern_clusters | id, label, summary, status, model_version, created_at, updated_at | AI が作った分類。画面表示前に長さ・禁止語・個人情報を検査 |
| concern_representations | concern_id, locale, body, status, error_code, updated_at | locale は ja-Hira または en。原文は concerns.body に保持 |
| concern_processing_jobs | id, concern_id, job_type, status, attempt_count, available_at, last_error, started_at, completed_at | job_type は moderation, ja_hira, en_translation, clustering。concern_id と job_type の組を UNIQUE |
| concern_reactions | concern_id, actor_id, reaction_type, created_at | MVP は reaction_type を一種類に固定し、concern_id と actor_id の組を UNIQUE |
| concern_views | concern_id, actor_id, first_viewed_at, last_viewed_at, view_count | 既読判定と推薦用の集約行。concern_id と actor_id の組を主キー |
| learning_events | id, actor_id, event_type, concern_id, cluster_id, quiz_id, occurred_at | view, reaction, quiz_answer などの学習イベントを保存 |
| feed_impressions | id, actor_id, concern_id, strategy, reason_code, algorithm_version, position, exposed_at, opened_at | 推薦品質の確認用。fallback で新着順にした場合も strategy に記録 |

concerns の processing_status は次の概要値とする。

- pending: 未処理
- processing: いずれかのジョブを処理中
- ready: 必要な派生データの生成が完了
- failed: 一部処理に失敗。ただし原文は利用可能

モデレーションの判定不能は、processing の失敗とは別に visibility_status を pending のまま保持する。これにより、AI 処理の失敗で原文を失わず、不適切な投稿だけは公開保留にできる。

### 4.3 クイズ

| テーブル | 主なカラム | 制約・用途 |
| --- | --- | --- |
| quizzes | id, quiz_date, status, title, created_at, published_at, hidden_at | quiz_date は UNIQUE。status は draft, published, closed, hidden |
| quiz_participants | id, quiz_id, actor_id, concern_id, display_order, age_group_snapshot, gender_snapshot, region_code_snapshot, explanation | クイズに登場する3人。quiz_id と actor_id、quiz_id と concern_id をそれぞれ UNIQUE |
| quiz_options | quiz_id, concern_id, display_order | 3件の投稿を混ぜて表示する。quiz_id と display_order を UNIQUE |
| quiz_attempts | id, quiz_id, actor_id, score, answered_at | quiz_id と actor_id を UNIQUE にして二重回答を防ぐ |
| quiz_answers | attempt_id, participant_id, selected_concern_id, is_correct | attempt_id と participant_id、attempt_id と selected_concern_id を UNIQUE |

quiz_options の (quiz_id, concern_id) は quiz_participants の同じ組を参照する複合外部キーにする。quiz_answers.selected_concern_id も、同じ quiz_id の quiz_options に存在することを複合外部キーまたはユースケースで検証する。

クイズ回答は次の処理を一つのトランザクションで行う。

1. 公開中のクイズであることを確認する。
2. 元投稿3件がすべて公開中であることを確認する。
3. quiz_attempts を挿入する。既存なら 409 を返す。
4. 3件の quiz_answers を挿入する。
5. 正答数を計算し、score を更新する。
6. learning_events に回答イベントを追加する。

元投稿が hidden または deleted になった場合は、クイズを hidden に更新し、クイズ画面から投稿本文を表示しない。

### 4.4 LINE

| テーブル | 主なカラム | 制約・用途 |
| --- | --- | --- |
| line_webhook_events | provider_event_id, actor_id, event_type, status, received_at, processed_at, error_code | LINE の再送に対する冪等性を確保。生の webhook payload は保存しない |
| line_broadcasts | id, quiz_id, idempotency_key, status, requested_at, finished_at, last_error | デイリークイズ一斉配信の実行単位 |
| line_broadcast_deliveries | quiz_id, actor_id, broadcast_id, status, attempt_count, sent_at, last_error | quiz_id と actor_id を UNIQUE にし、再実行時の重複送信を防ぐ |

配信再実行時は、sent の明細を送信済みとしてスキップし、failed の明細だけを再試行する。LINE の user ID やアクセストークンはログとレスポンスに出力しない。

## 5. SQLite で必ず設定する制約

### 一意性

- anonymous_sessions.token_hash
- line_users.line_user_id_hash
- quizzes.quiz_date
- concerns の同一 actor によるリアクション
- concerns の同一 actor による既読集約
- quiz_participants の quiz_id と actor_id
- quiz_attempts の quiz_id と actor_id
- line_broadcast_deliveries の quiz_id と actor_id

### CHECK 制約

- actors.kind: anonymous, line
- concerns.input_method: web, line, voice
- concerns.visibility_status: pending, published, hidden, deleted
- concern_processing_jobs.status: pending, running, succeeded, failed
- concern_representations.locale: ja-Hira, en
- quizzes.status: draft, published, closed, hidden
- 数値の display_order, score, view_count, attempt_count は 0 以上

属性値の表示名はデータベースに日本語の自由入力で保存せず、API のコード値を利用する。例えば年代は 10s, 20s, 30s, 40s, 50s_plus, no_answer、性別は male, female, non_binary, other, no_answer とする。

### 推奨インデックス

```sql
CREATE INDEX concerns_feed_idx
  ON concerns (visibility_status, created_at DESC, id DESC);

CREATE INDEX concerns_cluster_feed_idx
  ON concerns (cluster_id, visibility_status, created_at DESC, id DESC);

CREATE INDEX concerns_region_feed_idx
  ON concerns (region_code, visibility_status, created_at DESC, id DESC);

CREATE INDEX concerns_actor_idx
  ON concerns (actor_id, created_at DESC);

CREATE INDEX processing_jobs_pickup_idx
  ON concern_processing_jobs (status, available_at);

CREATE INDEX views_actor_idx
  ON concern_views (actor_id, last_viewed_at DESC);

CREATE INDEX reactions_actor_idx
  ON concern_reactions (actor_id, created_at DESC);

CREATE INDEX learning_events_actor_idx
  ON learning_events (actor_id, occurred_at DESC);

CREATE INDEX feed_impressions_actor_idx
  ON feed_impressions (actor_id, exposed_at DESC);
```

フィードは created_at だけで並べず、同時刻の投稿を安定してページングするため id をタイブレーカーにする。

```sql
WHERE visibility_status = 'published'
  AND (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC
LIMIT ?
```

## 6. 主要処理とデータ更新

### 投稿

1. actor を解決する。匿名ならセッションを作成し、LINE なら line_users を解決する。
2. 本文・属性・input_method をサーバー側で検証する。
3. concerns を保存する。
4. concern_processing_jobs に必要なジョブを登録する。
5. API は AI 処理を待たずに投稿 ID と保存状態を返す。
6. 原文は visibility_status に応じて表示し、翻訳・クラスタリングは完了後に追加表示する。

### 既読とリアクション

- 既読は concern_views を INSERT または UPSERT し、learning_events に view を追加する。
- リアクションは INSERT ... ON CONFLICT DO NOTHING を使う。
- 集計数は concern_reactions の concern_id 件数から求める。必要になった場合だけ concerns に集計キャッシュを追加する。

### 推薦

1. concern_views から未読投稿を除外する。
2. 直近の cluster_id と地域の偏りを確認する。
3. 新着・クラスタ分散・地域分散で候補を並べる。
4. 各候補を feed_impressions に保存し、strategy と reason_code を返す。
5. AI や推薦処理が使えない場合は strategy=fallback で新着順を返す。

## 7. マイグレーションと実装順

既存の _health は維持し、次の順で migration を追加する。

1. actors、anonymous_sessions、line_users、regions
2. concern_clusters、concerns
3. concern_representations、concern_processing_jobs
4. concern_views、concern_reactions、learning_events、feed_impressions
5. quizzes、quiz_participants、quiz_options、quiz_attempts、quiz_answers
6. line_webhook_events、line_broadcasts、line_broadcast_deliveries
7. 各検索インデックス

実装時は次の3点を同じ PR に含める。

- backend/src/infrastructure/database/schema.ts の Drizzle schema
- backend/migrations/ の生成 SQL
- Repository と UseCase のテスト

アプリケーション層では、D1 固有の型を直接扱わず、既存の方針どおり Repository Port と D1/Drizzle Adapter を分離する。

## 8. 保存・削除方針

- concerns は物理削除よりも deleted への状態変更を優先する。
- deleted の投稿は一般フィード、クイズ、推薦から除外する。
- 匿名セッションの expires_at を過ぎた actor の学習履歴は取得できないようにする。
- 投稿削除要求では、対象 concern と派生表現・クラスタ表示・クイズ表示を同時に非公開化する。
- 生音声、IP、LINE アクセストークンは保存しない。
- デモ終了時には、投稿、表現、学習履歴、LINE 連携情報をまとめて削除できる手順を用意する。
