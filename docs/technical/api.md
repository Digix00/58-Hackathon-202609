# 目安箱 API仕様

HTTP API の共通仕様、エンドポイント、データ形式、認証、エラー、冪等性を定義する。

本ドキュメントは [プロダクト要件](../requirements/product.md) と [データモデル](./data.md) を前提とする。実装時に判断が分かれないよう、MVP / デモ必須機能に必要な HTTP 境界をここで固定する。

## 1. 共通仕様

### 1.1 ベースパス

- 通常 API: `/api/v1`
- 運用監視: `GET /health`
- LINE Webhook: `POST /api/v1/webhooks/line`

`/health` は Hono RPC の公開 API とは分離し、Worker と D1 の疎通確認用途として維持する。

### 1.2 データ形式

- 通常の Request / Response は JSON
- `Content-Type: application/json`
- 日時は ISO 8601 UTC 文字列
- ID は API 上では opaque string として扱い、クライアントは形式に依存しない
- 空文字列は原則として未指定扱いにせず validation error とする
- 任意項目を送信しない場合は省略する。明示的に「未回答」を表す必要がある値のみ enum に含める

### 1.3 匿名セッション

Web の匿名利用者はサーバーが発行する匿名セッション ID で識別する。

- 初回アクセス時にフロントエンドが匿名セッションを作成する
- 以後、`X-Anonymous-Session-Id` ヘッダーで送信する
- セッション ID は投稿者本人を公開上識別するものではない
- LINE 経由の操作では LINE user ID から内部 `actor_key` を解決し、Web の匿名セッション ID は使用しない
- API のレスポンスに `actor_key`、LINE user ID、そのハッシュ値は含めない

匿名セッション作成:

```
POST /api/v1/sessions/anonymous
```

Response:

```json
{
  "sessionId": "anon_01J...",
  "expiresAt": "2026-09-28T00:00:00.000Z"
}
```

### 1.4 認証種別

| 種別 | 用途 |
| --- | --- |
| 不要 | 公開情報の取得、匿名セッション作成 |
| 匿名セッション | Web からの投稿、既読、リアクション、クイズ回答、履歴 |
| LINE 署名 | LINE Messaging API Webhook |
| 内部認証 | LINE 一斉配信など運営用 API |

内部 API は `Authorization: Bearer <INTERNAL_API_TOKEN>` を利用する。

### 1.5 共通エラー形式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください",
    "details": [
      {
        "field": "body",
        "reason": "required"
      }
    ],
    "requestId": "req_01J..."
  }
}
```

- `message` はユーザーに表示可能な短い日本語
- `details` は validation error など必要な場合のみ返す
- スタックトレース、外部 API の秘密情報、SQL を返さない

### 1.6 HTTP ステータス

| Status | 用途 |
| --- | --- |
| 200 | 取得・更新成功 |
| 201 | Resource 作成成功 |
| 202 | 非同期処理を受け付けた |
| 204 | 成功したが Response body が不要 |
| 400 | Request の形式・値が不正 |
| 401 | セッション・内部認証・LINE 認証に失敗 |
| 403 | 認証済みだが操作不可 |
| 404 | Resource が存在しない、または公開対象外 |
| 409 | 重複登録・状態競合 |
| 413 | 音声など Request body が大きすぎる |
| 422 | JSON は妥当だがドメイン制約を満たさない |
| 429 | Rate limit |
| 500 | 想定外のサーバーエラー |
| 502 | 外部サービスから不正・失敗応答 |
| 503 | 外部 AI / LINE 等が一時利用不可 |

### 1.7 冪等性

POST のうち二重操作を避ける必要があるものは以下の方針とする。

- リアクション: `concern_id + actor_key + reaction_type` を一意制約にする
- 既読: `concern_id + actor_key` を一意制約にする
- クイズ回答: `quiz_id + actor_key` 単位で回答済みを判定する
- LINE 一斉配信: `quiz_id` 単位で配信状態を持ち、同一クイズを再送しない
- LINE Webhook: LINE の webhook event ID を利用できる場合は重複処理を防止する

## 2. エンドポイント一覧

### 2.1 運用・セッション

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/health` | 実装済み | 不要 | Worker / D1 疎通確認 |
| POST | `/api/v1/sessions/anonymous` | MVP | 不要 | 匿名セッション作成 |

### 2.2 悩み

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/concerns` | MVP | 匿名セッション | 悩み投稿 |
| GET | `/api/v1/concerns` | MVP | 任意 | フィード取得 |
| GET | `/api/v1/concerns/:id` | MVP | 任意 | 悩み詳細取得 |
| POST | `/api/v1/concerns/:id/reactions` | MVP | 匿名セッション | リアクション登録 |
| DELETE | `/api/v1/concerns/:id/reactions/:type` | 任意 | 匿名セッション | 自分のリアクション解除 |
| PUT | `/api/v1/concerns/:id/view` | MVP | 匿名セッション | 既読状態登録 |

### 2.3 クラスタ

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/clusters` | デモ必須 | 不要 | 公開クラスタ一覧取得 |
| GET | `/api/v1/clusters/:id/concerns` | デモ必須 | 任意 | クラスタ内の悩み取得 |

### 2.4 クイズ

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/quizzes/today` | デモ必須 | 任意 | 当日のクイズ取得 |
| GET | `/api/v1/quizzes/:id` | デモ必須 | 任意 | 指定クイズ取得 |
| POST | `/api/v1/quizzes/:id/answers` | デモ必須 | 匿名セッション | 回答登録 |

### 2.5 学習履歴

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/history/summary` | デモ必須 | 匿名セッション | クラスタ・地域・属性傾向の集計 |
| GET | `/api/v1/history/quiz-answers` | デモ必須 | 匿名セッション | クイズ回答履歴 |

LINE の Web 画面から履歴を参照する場合は、別途 LINE 連携済みセッションへ交換する認証方式を実装する。生の LINE user ID をブラウザへ渡さない。

### 2.6 音声

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/speech/transcriptions` | デモ必須 | 匿名セッション | 一時音声を文字起こし |

### 2.7 LINE

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/webhooks/line` | デモ必須 | LINE 署名 | follow / unfollow / message 等を受信 |
| POST | `/api/v1/internal/line/broadcasts/daily-quiz` | デモ必須 | 内部認証 | 当日クイズを友だち全員へ一斉配信 |

一斉配信は個別ユーザーを列挙して送るのではなく、LINE Messaging API の broadcast を利用して全友だちへ送信する方針とする。

## 3. 悩み API

### 3.1 POST /api/v1/concerns

悩みを保存する。保存と AI 処理を分離し、AI の完了を待たずに返す。

Request:

```json
{
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "ageGroup": "20s",
  "gender": "prefer_not_to_say",
  "region": "大阪府",
  "inputMethod": "web"
}
```

制約:

- `body`: 必須。trim 後 1〜1000 文字
- `ageGroup`: 任意。例: `under_20`, `20s`, `30s`, ... `70_plus`
- `gender`: 任意。実装 enum は UI と統一する。最低限 `prefer_not_to_say` を含める
- `region`: 任意。都道府県または仕様で定義した広域区分のみ
- `inputMethod`: Web API からは原則 `web` または `voice`
- 正確な年齢、住所、緯度経度は受け付けない

Response: `201 Created`

```json
{
  "id": "concern_01J...",
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "attributes": {
    "ageGroup": "20s",
    "gender": "prefer_not_to_say",
    "region": "大阪府"
  },
  "inputMethod": "web",
  "representations": {
    "jaHira": null,
    "en": null
  },
  "cluster": null,
  "reactionCount": 0,
  "publicationStatus": "published",
  "processingStatus": "not_started",
  "createdAt": "2026-09-20T10:00:00.000Z"
}
```

公開前モデレーションで保留する場合は `publicationStatus: "pending"` とする。

保存後、翻訳・ひらがな化・クラスタリング等を非同期起動し、その失敗によって投稿そのものをロールバックしない。

### 3.2 GET /api/v1/concerns

フィードを取得する。

Query:

| Param | 必須 | 内容 |
| --- | --- | --- |
| `limit` | 任意 | 1〜50、default 20 |
| `cursor` | 任意 | 次ページカーソル |
| `sort` | 任意 | `recommended` / `newest`。default はセッションがあれば `recommended`、なければ `newest` |
| `clusterId` | 任意 | クラスタ絞り込み |
| `region` | 任意 | 地域絞り込み |
| `language` | 任意 | `original` / `ja-hira` / `en` |

Response:

```json
{
  "items": [
    {
      "id": "concern_01J...",
      "body": "食堂が混んでいて...",
      "attributes": {
        "ageGroup": "20s",
        "gender": "prefer_not_to_say",
        "region": "大阪府"
      },
      "cluster": {
        "id": "cluster_01J...",
        "label": "昼休み・食堂"
      },
      "reactionCount": 12,
      "viewed": false,
      "recommendationReason": "まだ読んでいない地域の悩みです",
      "createdAt": "2026-09-20T10:00:00.000Z"
    }
  ],
  "nextCursor": "eyJ..."
}
```

- `publicationStatus = published` のみ返す
- `deleted` / `hidden` / `pending` は返さない
- 匿名セッションがない場合、`viewed` と個人向け推薦は省略または既定値とする
- 推薦処理に失敗した場合は新着順へフォールバックする

### 3.3 GET /api/v1/concerns/:id

公開中の悩み 1 件を取得する。

- 非公開・削除済みも外部からは原則 `404`
- 投稿者特定につながる内部識別子は返さない

### 3.4 POST /api/v1/concerns/:id/reactions

Request:

```json
{
  "type": "empathy"
}
```

MVP でリアクション種別を 1 種類に固定する場合も API 上は `type` を持たせてよい。

Response: 初回 `201`、同一リアクションを再送した場合は `200` とし、二重加算しない。

```json
{
  "reactionCount": 13,
  "reacted": true
}
```

### 3.5 PUT /api/v1/concerns/:id/view

既読を冪等に登録する。

Response:

```json
{
  "viewed": true,
  "viewedAt": "2026-09-21T00:10:00.000Z"
}
```

同じ利用者が複数回呼んでも履歴を無制限に追加しない。

## 4. クラスタ API

### 4.1 GET /api/v1/clusters

Query:

- `limit`: default 20
- `cursor`: 任意
- `region`: 任意

Response:

```json
{
  "items": [
    {
      "id": "cluster_01J...",
      "label": "昼休み・食堂",
      "summary": "昼休み中に食事や休憩時間を確保しづらい悩み",
      "concernCount": 18
    }
  ],
  "nextCursor": null
}
```

AI が生成した label / summary は保存前に長さ・禁止語・個人情報を検査する。

## 5. クイズ API

### 5.1 GET /api/v1/quizzes/today

サーバー基準の日付で公開中の当日クイズを返す。クイズがまだ生成されていない場合は `404 QUIZ_NOT_READY` とする。

Response:

```json
{
  "id": "quiz_2026-09-21",
  "date": "2026-09-21",
  "participants": [
    {
      "id": "participant_1",
      "attributes": {
        "ageGroup": "20s",
        "gender": "prefer_not_to_say",
        "region": "大阪府"
      }
    }
  ],
  "concerns": [
    {
      "id": "concern_a",
      "body": "昼休みに...",
      "displayOrder": 1
    }
  ],
  "answered": false
}
```

重要:

- `participant.id` はクイズ内だけで通用する ID とし、actor_key を使わない
- participant と concern の並びは別々にシャッフルする
- 正解対応は回答前レスポンスに含めない
- 3 participant / 3 concern を返す
- 3 participant は異なる actor_key から作成する

### 5.2 POST /api/v1/quizzes/:id/answers

3 件の対応付けを 1 Request で確定する。

Request:

```json
{
  "matches": [
    {
      "participantId": "participant_1",
      "concernId": "concern_b"
    },
    {
      "participantId": "participant_2",
      "concernId": "concern_a"
    },
    {
      "participantId": "participant_3",
      "concernId": "concern_c"
    }
  ]
}
```

Validation:

- participant / concern は当該 quiz に含まれるものだけ
- participantId と concernId はそれぞれ重複不可
- 3 件すべて回答する
- 同一利用者の確定回答は原則上書き不可

Response:

```json
{
  "quizId": "quiz_2026-09-21",
  "score": 2,
  "total": 3,
  "results": [
    {
      "participantId": "participant_1",
      "selectedConcernId": "concern_b",
      "correctConcernId": "concern_a",
      "correct": false
    }
  ],
  "answeredAt": "2026-09-21T00:20:00.000Z"
}
```

二重回答時は既存結果を `200` で返すか `409` とする。実装ではどちらかに統一し、MVP では `409 QUIZ_ALREADY_ANSWERED` を推奨する。

## 6. 学習履歴 API

### 6.1 GET /api/v1/history/summary

Response:

```json
{
  "viewedConcernCount": 24,
  "clusters": [
    {
      "clusterId": "cluster_01J...",
      "label": "昼休み・食堂",
      "count": 5
    }
  ],
  "regions": [
    {
      "region": "大阪府",
      "count": 4
    }
  ],
  "quiz": {
    "answeredCount": 3,
    "correctCount": 7,
    "totalQuestions": 9,
    "accuracy": 0.7778
  }
}
```

### 6.2 GET /api/v1/history/quiz-answers

Query:

- `limit`: default 20
- `cursor`: 任意

クイズ回答日時、score、total を返す。正確な投稿者識別情報は返さない。

## 7. 音声 API

### 7.1 POST /api/v1/speech/transcriptions

`multipart/form-data` で音声ファイルを受け付ける。

Fields:

- `audio`: 必須
- `language`: 任意、default `ja`

Response:

```json
{
  "text": "食堂が混んでいて昼休みに休めない",
  "language": "ja"
}
```

- 生音声は永続化しない
- 文字起こし後、ユーザーが編集してから `POST /concerns` する
- 音声 API 自体は concern を作成しない
- 許可 MIME type と最大サイズは実装時に定数化する

## 8. LINE Webhook

### 8.1 POST /api/v1/webhooks/line

LINE Platform からの Webhook 専用。

処理順:

1. raw request body を取得
2. `x-line-signature` を channel secret で検証
3. event を parse
4. event type ごとの use case を呼ぶ
5. LINE へ `200 OK` を返す

外部サービス処理を長時間同期実行しない。

### 8.2 follow event

- LINE user ID から内部 user / actor_key を作成または再有効化
- `friend_status = active` とする
- LINE user ID をレスポンスや通常ログへ出さない

### 8.3 unfollow event

- 対象 user の `friend_status = inactive` を更新
- 過去の匿名投稿を削除しない
- 以後の broadcast 対象からは LINE Platform 側の友だち状態によって除外される

### 8.4 text message event

MVP / デモでは「悩み本文」として扱う。

- 本文 validation を通す
- `inputMethod = line`
- LINE user の actor_key に紐づけて concern を保存
- Web 投稿と同じ非同期処理へ流す
- 成功時は受付完了を reply message で返してよい
- command 形式を追加する場合は通常投稿との判定ルールを別途定義する

画像、スタンプ、位置情報など未対応 message type は投稿として保存せず、安全な案内を reply するか無視する。

## 9. LINE デイリークイズ一斉配信

### 9.1 POST /api/v1/internal/line/broadcasts/daily-quiz

内部処理・デモ操作から呼び出す。

Request:

```json
{
  "quizId": "quiz_2026-09-21"
}
```

quizId を省略した場合に today を使う設計も可能だが、再現性と誤配信防止のため明示指定を基本とする。

処理:

1. 内部認証
2. quiz が `published` であることを確認
3. Web クイズ URL を生成
4. LINE Messaging API の broadcast endpoint で全友だちへ一斉送信
5. 配信結果を記録
6. 同一 quiz の再実行を拒否

Response: `202 Accepted` または LINE API 完了まで同期する場合は `200 OK`

```json
{
  "quizId": "quiz_2026-09-21",
  "status": "accepted",
  "broadcastedAt": "2026-09-21T00:00:00.000Z"
}
```

すべてのユーザーへの一斉送信であるため、アプリケーション DB の `users` を走査して個別 push する設計にはしない。

## 10. 非同期処理と processingStatus

concern 作成後の外部処理は HTTP Request と分離する。

概念上の状態:

- `not_started`
- `translating`
- `clustering`
- `ready`
- `failed`

複数処理を個別に追跡する実装へ拡張してもよいが、API は少なくとも「原文は利用可能だが生成物は未完了」を表現できること。

AI / 翻訳処理失敗時:

- concern 自体は削除しない
- 原文は閲覧可能
- representation / cluster がない場合は null として返す
- クライアントが無限 polling しないよう失敗状態を返す

## 11. Rate Limit

最低限、次を制限対象とする。

- concern 投稿
- reaction
- quiz answer
- speech transcription
- internal broadcast

匿名セッション単位だけでは使い捨て可能なため、Cloudflare 側の rate limiting 等も組み合わせる。IP アドレスはアプリ DB には保存しない。

## 12. Hono RPC 方針

フロントエンドから直接利用する API は Hono RPC の型共有対象とする。

対象:

- sessions
- concerns
- clusters
- quizzes
- history
- speech

対象外または別境界として扱う:

- LINE Webhook
- internal LINE broadcast
- health

route 定義を 1 ファイルへ集中させず、機能単位の route / handler を `createApp` で組み立てる。ただし Hono RPC の型が失われないよう app chaining / route mounting の型推論を確認する。

## 13. 実装時の優先順位

1. 匿名セッション
2. concern 作成・一覧・詳細
3. reaction / view
4. cluster
5. quiz 取得・回答
6. history
7. speech transcription
8. LINE Webhook
9. LINE broadcast

API 追加時は、正常系だけでなく validation、404、重複操作、外部サービス失敗のテストを同じ変更単位で追加する。
