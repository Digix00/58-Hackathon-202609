# 目安箱 API仕様

LINEミニアプリ（LIFF）から利用する、目安箱の HTTP API 契約を定義する。
本書では、実装時に判断が分かれないよう、認証主体、入力値、レスポンス、状態遷移、重複操作、LINE連携の責務を固定する。

本書は [プロダクト要件](../requirements/product.md) の API 境界を定義する文書であり、次の方針を前提とする。

- 全ユーザーは LINE / LIFF 認証済みのユーザーとして扱う
- 内部の投稿者識別には users.id を使い、API のレスポンスには返さない
- 投稿・既読・リアクション・クイズ回答・学習履歴は、認証済みユーザーに紐づける
- LINE の日次クイズ配信は、ユーザーを列挙して個別送信せず、LINE Messaging API の Broadcast API で全友だちへ送信する
- 投稿保存と AI / 外部サービス処理は分離し、外部処理の失敗で原文投稿を失わない

## 1. 共通仕様

### 1.1 ベースパス

- 通常 API: /api/v1
- ヘルスチェック: GET /health
- LINE Webhook: POST /api/v1/webhooks/line
- 内部配信 API: POST /api/v1/line/broadcasts/daily-quiz

通常 API は Hono RPC の型共有対象とする。ヘルスチェック、LINE Webhook、内部配信 API は外部サービス・内部処理との境界が異なるため、通常の画面向け API と分けて扱う。

### 1.2 リクエストとレスポンス

通常の画面向け API は、次のヘッダーを利用する。

~~~http
Authorization: Bearer <LIFF_ID_TOKEN>
Content-Type: application/json
Accept: application/json
~~~

- 通常の JSON Request / Response は UTF-8 の JSON とする
- 音声文字起こしだけは Content-Type: multipart/form-data を使用する
- JSON のキーは camelCase とする
- 日時は ISO 8601 UTC の文字列（末尾が Z）で返す
- クイズの業務日だけは Asia/Tokyo 基準の YYYY-MM-DD 文字列で返す
- ID は opaque string とし、クライアントは ID の形式や採番規則に依存しない
- クライアントが userId、lineUserId、actorKey を Request body や Query に指定しても、サーバーは認証済みトークンから解決したユーザーを使う
- 空文字列は未指定として扱わず、必須項目では validation error とする
- 任意項目を指定しない場合は、原則としてキー自体を省略する

### 1.3 認証

認証方式はエンドポイントごとに固定する。

| 認証方式 | 対象 | 認証方法 |
| --- | --- | --- |
| LIFF | 画面向け API | Authorization Bearer に LIFF の ID token を指定 |
| LINE 署名 | LINE Webhook | x-line-signature を channel secret で検証 |
| 内部認証 | LINE Broadcast API を起動する内部 API | Authorization Bearer に内部トークンを指定 |
| 不要 | GET /health | Worker / D1 の疎通確認のみ |

#### LIFF 認証の処理

1. フロントエンドが LIFF SDK の liff.init と liff.login を実行する
2. フロントエンドが liff.getIDToken で ID token を取得する
3. フロントエンドが Authorization Bearer に ID token を指定して通常 API を呼び出す
4. バックエンドが LINE Login v2.1 の Verify ID token API へ ID token と期待する channel ID を送る
5. 検証結果の subject（LINE user ID）から users.id を解決または upsert する
6. 以降のユースケースには、クライアント入力ではなく解決済み users.id を渡す

次の値は信頼しない。

- Request body や Query に含まれる userId
- クライアントが独自に生成したユーザー識別子
- ID token を検証せずに JWT の payload だけをデコードした値

ID token の検証に失敗した場合は 401 INVALID_ID_TOKEN を返す。生の ID token、LINE user ID、アクセストークンはレスポンスや通常ログへ出力しない。

### 1.4 共通エラー形式

すべての API エラーは、次の形式に統一する。

~~~json
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
~~~

- message は画面に表示できる短い日本語とする
- details は入力項目や Query のどこが不正かを示す場合だけ返す
- requestId はサーバーが発行し、レスポンスの X-Request-Id ヘッダーにも設定する
- スタックトレース、SQL、秘密情報、外部サービスの生レスポンスは返さない
- 外部サービスの詳細はサーバーログへも必要最小限だけ記録する

### 1.5 HTTP ステータス

| Status | 用途 | 代表的な code |
| --- | --- | --- |
| 200 | 取得・更新・冪等な再実行の成功 | — |
| 201 | リソースの新規作成 | — |
| 204 | 成功し Response body が不要 | — |
| 400 | JSON、Header、Query の形式が不正 | INVALID_REQUEST、INVALID_CURSOR |
| 401 | 認証情報がない、または無効 | AUTHENTICATION_REQUIRED、INVALID_ID_TOKEN、INVALID_LINE_SIGNATURE |
| 403 | 認証済みだが操作できない | USER_DELETED、FORBIDDEN |
| 404 | リソースがない、または公開対象外 | NOT_FOUND、QUIZ_NOT_AVAILABLE |
| 409 | 状態競合、同一クイズへの回答済み | QUIZ_ALREADY_ANSWERED、BROADCAST_IN_PROGRESS |
| 413 | Request body または音声が大きすぎる | PAYLOAD_TOO_LARGE |
| 415 | 未対応の Content-Type / MIME type | UNSUPPORTED_MEDIA_TYPE |
| 422 | JSON は妥当だがドメイン制約に違反 | DOMAIN_RULE_VIOLATION |
| 429 | レート制限超過 | RATE_LIMITED |
| 502 | 外部サービスから不正な応答を受けた | UPSTREAM_INVALID_RESPONSE |
| 503 | 外部サービスが一時利用できない | UPSTREAM_UNAVAILABLE |
| 500 | 上記以外の想定外エラー | INTERNAL_ERROR |

429 を返す場合は、可能であれば再試行までの秒数を Retry-After ヘッダーで返す。

### 1.6 識別子と属性コード

API は表示用の日本語文字列ではなく、次のコード値を利用する。

#### 年代

- 10s
- 20s
- 30s
- 40s
- 50s_plus
- no_answer

#### 性別

- male
- female
- non_binary
- other
- no_answer

#### 地域

regionCode は regions マスタで定義されたコードを指定する。都道府県や広域区分の名称を自由入力では受け付けない。例として osaka や kansai のようなコードを利用する。

#### 入力経路

- web: LIFF の投稿フォームから入力
- voice: 音声文字起こし結果を確認してから投稿
- line: LINE Webhook の text message から投稿

通常の POST /api/v1/concerns では web または voice だけを受け付ける。line は LINE Webhook の内部ユースケースからだけ設定する。

#### 投稿の公開状態

- pending: 公開前の確認待ち
- published: 一般フィードへ公開可能
- hidden: 非公開
- deleted: 削除済み

#### 投稿の処理状態

- pending: 非同期処理が未開始
- processing: いずれかの非同期処理を実行中
- ready: 必要な派生データの生成が完了
- failed: 一部処理に失敗したが原文は利用可能

representations.jaHira と representations.en は、作成 API では未生成時に null、一覧・詳細 API では pending、ready、failed の状態値を返す。ready の本文は language の選択対象となり、pending または failed の場合は原文へフォールバックする。

### 1.7 ページネーション

一覧 API は cursor pagination を利用する。

- limit の既定値は 20、指定可能な範囲は 1〜50
- cursor はサーバーが発行する opaque string とする
- クライアントは cursor をデコード・編集してはならない
- cursor が不正、期限切れ、または Query 条件と一致しない場合は 400 INVALID_CURSOR を返す
- nextCursor が null の場合、次のページはない
- newest の並びは createdAt DESC, id DESC とし、同時刻でも順序を安定させる
- recommended の cursor は、そのフィードの条件と推薦アルゴリズムのバージョンに紐づける

共通のレスポンス形式は次のとおり。

~~~json
{
  "items": [],
  "nextCursor": null
}
~~~

## 2. エンドポイント一覧

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | /health | 実装済み | 不要 | Worker / D1 の疎通確認 |
| POST | /api/v1/concerns | MVP | LIFF | 悩み投稿 |
| GET | /api/v1/concerns | MVP | LIFF | 新着または推薦フィード |
| GET | /api/v1/concerns/:concernId | MVP | LIFF | 悩み詳細 |
| POST | /api/v1/concerns/:concernId/reactions | MVP | LIFF | リアクション登録 |
| PUT | /api/v1/concerns/:concernId/view | MVP | LIFF | 既読登録 |
| GET | /api/v1/clusters | デモ必須 | LIFF | 公開クラスタ一覧 |
| GET | /api/v1/clusters/:clusterId/concerns | デモ必須 | LIFF | クラスタ内の悩み |
| GET | /api/v1/quizzes/today | デモ必須 | LIFF | Asia/Tokyo の当日クイズ |
| GET | /api/v1/quizzes/:quizId | デモ必須 | LIFF | 指定クイズ |
| POST | /api/v1/quizzes/:quizId/answers | デモ必須 | LIFF | 対応付け回答 |
| GET | /api/v1/history/summary | デモ必須 | LIFF | 閲覧・クラスタ・地域・クイズ集計 |
| GET | /api/v1/history/quiz-answers | デモ必須 | LIFF | クイズ回答履歴 |
| POST | /api/v1/speech/transcriptions | デモ必須 | LIFF | 音声の一時文字起こし |
| POST | /api/v1/webhooks/line | デモ必須 | LINE 署名 | follow / unfollow / text message |
| POST | /api/v1/line/broadcasts/daily-quiz | デモ必須 | 内部認証 | 全友だちへクイズを一斉配信 |

匿名セッション作成 API、userId を受け取る API、ユーザーごとに Push API を呼び出す配信 API は実装しない。

## 3. 悩み API

### 3.1 POST /api/v1/concerns

LIFF 認証済みユーザーの悩みを保存する。保存と非同期処理を分離するため、翻訳・ひらがな化・クラスタリングの完了を待たずに返す。

#### Request

~~~json
{
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "ageGroup": "20s",
  "gender": "no_answer",
  "regionCode": "osaka",
  "inputMethod": "web"
}
~~~

#### Validation

- body は必須。前後の空白を trim した後、1〜1000 文字
- ageGroup は任意。指定時は定義済みの年代コードだけを受け付ける
- gender は任意。指定しない場合はキーを省略し、明示的に回答しない場合は no_answer を指定する
- regionCode は任意。指定時は regions マスタに存在するコードだけを受け付ける
- inputMethod は必須で、web または voice のいずれか
- userId、lineUserId、actorKey は Request body に含めない
- 正確な年齢、住所、緯度経度、IP アドレスは受け付けない
- 本文に氏名、連絡先、住所などの個人情報が含まれる場合は、モデレーション結果に応じて pending とする

#### 処理

1. Authorization の ID token を検証し、内部 users.id を解決する
2. Request を validation する
3. concerns を保存する
4. moderation、ja_hira、en_translation、clustering の非同期ジョブを登録する
5. 投稿 ID と保存時点の状態を返す
6. 非同期処理の完了後、processingStatus と派生データを更新する

#### Response: 201 Created

~~~json
{
  "id": "concern_01J...",
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "attributes": {
    "ageGroup": "20s",
    "gender": "no_answer",
    "regionCode": "osaka"
  },
  "inputMethod": "web",
  "visibilityStatus": "published",
  "processingStatus": "pending",
  "representations": {
    "jaHira": null,
    "en": null
  },
  "cluster": null,
  "reactionCount": 0,
  "createdAt": "2026-09-20T10:00:00.000Z"
}
~~~

- モデレーションの確認が必要な場合は visibilityStatus を pending として返す
- visibilityStatus が published 以外の投稿は一般フィードへ返さない
- 保存成功後の外部処理失敗では投稿を削除しない
- 既存の入力制限に該当する場合は 400 または 422 を返し、保存しない

### 3.2 GET /api/v1/concerns

公開済みの悩みを、対象ユーザー向けのフィードとして返す。

#### Query

| Param | 必須 | 既定値 | 内容 |
| --- | --- | --- | --- |
| limit | 任意 | 20 | 1〜50 |
| cursor | 任意 | — | 次ページの opaque cursor |
| sort | 任意 | recommended | recommended または newest |
| clusterId | 任意 | — | 指定クラスタに絞る |
| regionCode | 任意 | — | 指定地域に絞る |
| language | 任意 | original | original、jaHira、en |

#### Response: 200 OK

~~~json
{
  "items": [
    {
      "id": "concern_01J...",
      "body": "食堂が混んでいて昼休みに休めない",
      "language": "original",
      "attributes": {
        "ageGroup": "20s",
        "gender": "no_answer",
        "regionCode": "osaka"
      },
      "representations": {
        "jaHira": "ready",
        "en": "pending"
      },
      "cluster": {
        "id": "cluster_01J...",
        "label": "昼休み・食堂",
        "summary": "昼休み中の食事や休憩に関する悩み"
      },
      "reactionCount": 12,
      "viewed": false,
      "reacted": false,
      "recommendation": {
        "strategy": "recommended",
        "reasonCode": "unread_cluster"
      },
      "createdAt": "2026-09-20T10:00:00.000Z"
    }
  ],
  "nextCursor": "eyJ..."
}
~~~

- visibilityStatus が published の投稿だけを返す
- hidden、deleted、pending の投稿は 404 と区別せず、一覧から除外する
- language で指定した表現が ready でない場合は原文を body に返し、language は original とする
- representation の値が failed でも原文は返す
- viewed と reacted は認証済みユーザー自身の状態である
- sort=recommended では、未読、クラスタの分散、地域の分散、新しさを使う
- 推薦に必要な処理が失敗した場合は strategy=fallback として newest 相当で返す
- 推薦理由の code は画面側で表示文言へ変換する。サーバーは内部のスコアや個人識別情報を返さない

reasonCode の初期値は次のとおり。

- unread_cluster: 未読のクラスタを優先
- new_cluster: 最近読んでいないクラスタを優先
- region_diversity: 地域の偏りを避けるため選択
- newest: 新着順
- fallback_newest: 推薦処理失敗時の新着順

### 3.3 GET /api/v1/concerns/:concernId

公開済みの悩みを 1 件返す。

- Response の item 形式は GET /api/v1/concerns の items と同じ。ただし詳細取得では recommendation を省略する
- 非公開または存在しない concernId は 404 NOT_FOUND
- 詳細取得だけでは既読にしない。画面表示後に 3.5 の既読 API を呼び出す
- 投稿者を特定できる users.id、LINE user ID、LINE profile 情報は返さない

### 3.4 POST /api/v1/concerns/:concernId/reactions

悩みにリアクションを登録する。MVP の reactionType は empathy の 1 種類に固定する。

#### Request

~~~json
{
  "reactionType": "empathy"
}
~~~

#### Response

初回登録時は 201 Created、同じユーザーが同じ悩みに同じ reactionType を再送した場合は 200 OK とする。どちらの場合も集計を二重加算しない。

~~~json
{
  "concernId": "concern_01J...",
  "reactionType": "empathy",
  "reactionCount": 13,
  "reacted": true
}
~~~

- hidden、deleted、pending の悩みには登録できない
- concernId と userId と reactionType の組を一意にする
- 他ユーザーのリアクションを解除・変更する API は提供しない
- 同じ操作の再送は成功扱いとし、409 にはしない

### 3.5 PUT /api/v1/concerns/:concernId/view

悩みを認証済みユーザーの既読として登録する。Request body は持たない。

#### Response: 200 OK

~~~json
{
  "concernId": "concern_01J...",
  "viewed": true,
  "viewedAt": "2026-09-21T00:10:00.000Z"
}
~~~

- 同じ concernId に対して何度呼んでも成功する
- concern_views は concernId と userId の組で集約する
- firstViewedAt は最初の呼び出し時だけ設定し、lastViewedAt は呼び出しごとに更新してよい
- 同一の既読操作で学習履歴を無制限に増やさない
- 公開済みでない concernId は 404 NOT_FOUND とする

## 4. クラスタ API

### 4.1 GET /api/v1/clusters

公開済みの悩みを含むクラスタを返す。

#### Query

- limit: 1〜50、既定値 20
- cursor: opaque cursor
- regionCode: 任意。クラスタ内の公開済み悩みを地域で絞る

#### Response

~~~json
{
  "items": [
    {
      "id": "cluster_01J...",
      "label": "昼休み・食堂",
      "summary": "昼休み中の食事や休憩に関する悩み",
      "concernCount": 18
    }
  ],
  "nextCursor": null
}
~~~

- cluster の label、summary は AI 生成後に長さ、禁止語、個人情報を検査する
- 公開済みの悩みが 0 件のクラスタは返さない
- concernCount は published の悩みだけを数える

### 4.2 GET /api/v1/clusters/:clusterId/concerns

指定クラスタに属する公開済みの悩みを返す。

- Query は GET /api/v1/concerns の limit、cursor、sort、regionCode、language と同じ
- clusterId の絞り込みはサーバー側で行い、クライアントが別条件を組み合わせて判定しない
- Response は GET /api/v1/concerns と同じ形式
- 存在しない、または公開済みの悩みがない clusterId は 404 NOT_FOUND とする
- sort の既定値は newest とする

## 5. クイズ API

クイズの参加者と投稿の正しい対応は、回答前の API レスポンスへ含めない。

### 5.1 共通のクイズ表示形式

~~~json
{
  "id": "quiz_2026-09-21",
  "quizDate": "2026-09-21",
  "participants": [
    {
      "participantId": "participant_a",
      "attributes": {
        "ageGroup": "20s",
        "gender": "female",
        "regionCode": "osaka"
      },
      "displayOrder": 1
    },
    {
      "participantId": "participant_b",
      "attributes": {
        "ageGroup": "40s",
        "gender": "male",
        "regionCode": "kansai"
      },
      "displayOrder": 2
    },
    {
      "participantId": "participant_c",
      "attributes": {
        "ageGroup": "no_answer",
        "gender": "no_answer",
        "regionCode": "osaka"
      },
      "displayOrder": 3
    }
  ],
  "concerns": [
    {
      "concernId": "concern_a",
      "body": "昼休みでも食堂が混雑していて休めない",
      "language": "original",
      "displayOrder": 1
    },
    {
      "concernId": "concern_b",
      "body": "駅までの道が暗く、帰宅時に不安を感じる",
      "language": "original",
      "displayOrder": 2
    },
    {
      "concernId": "concern_c",
      "body": "病院の予約方法が複雑で困っている",
      "language": "original",
      "displayOrder": 3
    }
  ],
  "answered": false
}
~~~

- participants と concerns はそれぞれ 3 件ちょうど返す
- participants と concerns の配列順はそれぞれシャッフルする
- participantId は当該クイズ内だけで利用する opaque ID とし、users.id や LINE user ID を使わない
- concernId は公開済みの元投稿を参照するが、参加者との正しい対応は返さない
- 3 件の concern は実際の投稿であり、架空の選択肢は作らない
- クイズ生成後に元投稿が hidden または deleted になった場合は、クイズ自体を hidden として公開しない
- answered=true の場合は answerResult を追加し、同じ quiz の回答結果を表示できるようにする

### 5.2 GET /api/v1/quizzes/today

Asia/Tokyo の現在日付に対応する published クイズを返す。

- 当日クイズが存在しない、または元投稿が公開できない場合は 404 QUIZ_NOT_AVAILABLE
- Response は 5.1 の共通形式
- ルート実装では /today を /:quizId より先に登録し、today が quizId として解釈されないようにする

### 5.3 GET /api/v1/quizzes/:quizId

指定した published クイズを返す。

- Response は 5.1 の共通形式
- 存在しない、closed、hidden、元投稿が非公開のクイズは 404 QUIZ_NOT_AVAILABLE
- quizId は API が発行した opaque ID として扱う

### 5.4 POST /api/v1/quizzes/:quizId/answers

3 人の participant と 3 件の concern の対応付けを、一つの Request で確定する。

#### Request

~~~json
{
  "matches": [
    {
      "participantId": "participant_a",
      "concernId": "concern_b"
    },
    {
      "participantId": "participant_b",
      "concernId": "concern_c"
    },
    {
      "participantId": "participant_c",
      "concernId": "concern_a"
    }
  ]
}
~~~

#### Validation

- matches は 3 件ちょうど
- participantId は当該 quiz の participants に含まれ、3 件で重複しない
- concernId は当該 quiz の concerns に含まれ、3 件で重複しない
- quiz は published で、3 件の元投稿も published
- 回答者の userId は Request body から取得せず、LIFF ID token から解決する
- 同じ quiz に対する同じユーザーの回答は上書きしない

#### Response: 201 Created

~~~json
{
  "quizId": "quiz_2026-09-21",
  "score": 2,
  "total": 3,
  "results": [
    {
      "participantId": "participant_a",
      "selectedConcernId": "concern_b",
      "correctConcernId": "concern_a",
      "correct": false,
      "explanation": "昼休みの食堂に関する悩みです"
    },
    {
      "participantId": "participant_b",
      "selectedConcernId": "concern_c",
      "correctConcernId": "concern_c",
      "correct": true,
      "explanation": "属性と投稿内容の対応を確認できます"
    },
    {
      "participantId": "participant_c",
      "selectedConcernId": "concern_a",
      "correctConcernId": "concern_b",
      "correct": false,
      "explanation": "回答後に正しい対応を表示します"
    }
  ],
  "answeredAt": "2026-09-21T00:20:00.000Z"
}
~~~

- 回答確定、正答数計算、quiz_answers 保存、learning_events 保存は一つのトランザクションで行う
- 同じ quiz に回答済みの場合は 409 QUIZ_ALREADY_ANSWERED とする
- ネットワークタイムアウト後に再送して 409 になった場合は、GET /api/v1/quizzes/:quizId で answered=true の結果を取得する
- 正解結果は回答成功後だけ返す
- users.id、LINE user ID、他の回答者の識別情報は返さない

## 6. 学習履歴 API

学習履歴は LIFF で認証されたユーザー自身のデータだけを返す。

### 6.1 GET /api/v1/history/summary

#### Response

~~~json
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
      "regionCode": "osaka",
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
~~~

- viewedConcernCount はユーザーが既読にした公開投稿の distinct 件数
- clusters と regions は、既読履歴に現れた公開投稿を集計する
- quiz.answeredCount は回答済みクイズ数
- accuracy は correctCount / totalQuestions。totalQuestions が 0 の場合は 0
- users.deleted_at が設定されたユーザーは 403 USER_DELETED とする
- 内部 userId や投稿者の識別情報は返さない

### 6.2 GET /api/v1/history/quiz-answers

#### Query

- limit: 1〜50、既定値 20
- cursor: opaque cursor

#### Response

~~~json
{
  "items": [
    {
      "quizId": "quiz_2026-09-21",
      "quizDate": "2026-09-21",
      "score": 2,
      "total": 3,
      "answeredAt": "2026-09-21T00:20:00.000Z"
    }
  ],
  "nextCursor": null
}
~~~

- 自分の quiz_attempts だけを返す
- concernId、participantId、他ユーザーの情報は履歴一覧には含めない
- 並びは answeredAt DESC, quizId DESC とする

## 7. 音声 API

### 7.1 POST /api/v1/speech/transcriptions

音声を一時的に文字起こしする。文字起こし後の投稿保存は 3.1 の concerns API が行う。

#### Request

Content-Type は multipart/form-data とする。

| Field | 必須 | 制約 |
| --- | --- | --- |
| audio | 必須 | 10 MiB 以下。audio/webm、audio/mp4、audio/mpeg、audio/wav |
| language | 任意 | 既定値 ja。MVP では ja のみ |

- 音声の最大長は 60 秒
- 生音声は D1、R2、ログへ保存しない
- 文字起こし結果をユーザーが編集してから concerns API を呼び、inputMethod=voice とする
- 音声ファイルが大きすぎる場合は 413 PAYLOAD_TOO_LARGE
- MIME type が未対応の場合は 415 UNSUPPORTED_MEDIA_TYPE
- 音声認識サービスが失敗した場合は 503 UPSTREAM_UNAVAILABLE

#### Response: 200 OK

~~~json
{
  "text": "食堂が混んでいて昼休みに休めない",
  "language": "ja"
}
~~~

この API は concern を作成しないため、音声入力の途中で投稿を確定したことにはならない。

## 8. LINE Webhook

### 8.1 POST /api/v1/webhooks/line

LINE Platform からの Webhook 専用 endpoint。

#### 認証と処理順

1. raw Request body を読み取る
2. raw body と channel secret から x-line-signature を HMAC-SHA256 で検証する
3. 署名検証後に JSON を parse する
4. events を webhookEventId 単位で処理する
5. 処理を受け付けたら LINE へ 200 OK を返す

- 署名検証前に body を整形、再エンコード、parse してはならない
- webhookEventId を line_webhook_events に保存し、同じイベントを二重処理しない
- 生の Webhook payload は保存しない
- 既に処理済みの webhookEventId はユースケースを再実行せず、200 OK を返す
- 未対応 event type は保存せず、署名が正しければ 200 OK を返す
- 不正な署名は 401 INVALID_LINE_SIGNATURE とする

### 8.2 follow event

- event.source.userId の LINE user ID から users を upsert する
- friendStatus を active にする
- joinedAt、lastSeenAt を更新する
- LINE user ID の生値、プロフィール情報、アクセストークンは通常ログへ出さない

### 8.3 unfollow event

- event.source.userId に対応する users の friendStatus を unfollowed にする
- unfollowedAt を更新する
- 過去の投稿、既読、リアクション、学習履歴は削除しない
- LINE Broadcast API の配信対象除外は LINE Platform の友だち状態に任せる

### 8.4 text message event

MVP では user source から受信した text を悩み本文として扱う。

1. event.source.userId から内部 users.id を解決する
2. text を trim し、1〜1000 文字で validation する
3. concerns を inputMethod=line で保存する
4. Web 投稿と同じ非同期処理ジョブを登録する
5. replyToken が有効な間に受付結果を reply message で返す

- text が不正な場合は投稿を保存せず、修正を促す reply message を返す
- 画像、スタンプ、位置情報など未対応 message type は投稿として保存しない
- group source や room source は MVP 対象外とし、ユーザー単位へ変換できない場合は処理しない
- Webhook の HTTP レスポンスはイベント受付の成否を表し、AI 処理の完了を待たない

## 9. LINE デイリークイズ一斉配信

### 9.1 POST /api/v1/line/broadcasts/daily-quiz

内部運用、Cloudflare Cron、失敗時の再試行から、同じ配信ランナーを起動する。

#### 認証

- Authorization Bearer に INTERNAL_API_TOKEN を指定する
- LIFF ID token は受け付けない
- この endpoint をインターネットへ画面向け API として公開しない
- 通常ログへ内部トークン、LINE user ID、channel access token を出力しない

#### Request

~~~json
{
  "quizId": "quiz_2026-09-21"
}
~~~

quizId は必須とする。対象クイズを明示することで、再試行時に別の日のクイズを誤配信しない。

#### 処理

1. 内部認証を検証する
2. quizId のクイズが published であることを確認する
3. quizDate が当日の配信対象として妥当か確認する
4. idempotencyKey=daily-quiz:YYYY-MM-DD の line_broadcasts を取得または作成する
5. LINE Messaging API の POST /v2/bot/message/broadcast を一回の論理配信として呼び出す
6. Web クイズ URL を含む同一メッセージを LINE 公式アカウントの全友だちへ送信する
7. line_broadcast_attempts に試行結果、HTTP status、LINE request ID、Retry Key を記録する
8. 成功時は line_broadcasts を succeeded にし、送信時刻を保存する

重要な制約:

- users を全件走査して、ユーザーごとに Push API を呼び出してはならない
- 受信者ごとの delivery 行は作成しない
- LINE Broadcast API の全友だち配信を一回の論理実行として扱う
- アプリケーションの idempotencyKey と LINE API の Retry Key は別に管理する
- LINE API の応答が不明な状態で再試行する場合は、同じ論理リクエストの Retry Key を再利用して二重配信を抑止する

#### Response: 200 OK

~~~json
{
  "broadcastId": "broadcast_01J...",
  "quizId": "quiz_2026-09-21",
  "quizDate": "2026-09-21",
  "status": "succeeded",
  "requestedAt": "2026-09-21T00:00:00.000Z",
  "sentAt": "2026-09-21T00:00:01.000Z"
}
~~~

同じ quizDate の配信がすでに succeeded の場合は、LINE API を再度呼び出さず、200 OK で既存の成功結果を返す。

同じ idempotencyKey の配信が running 中の場合は、二つ目の LINE API 呼び出しを行わず、409 BROADCAST_IN_PROGRESS を返す。

LINE API が一時的に失敗した場合は、失敗した attempt を保存したうえで 503 BROADCAST_UPSTREAM_UNAVAILABLE を返す。failed の配信は同じ quizDate の idempotencyKey で再試行する。

### 9.2 Cloudflare Cron

- Cron の実行時刻は UTC として受け取る
- 実行対象の quizDate は Asia/Tokyo へ変換して決める
- scheduled handler は HTTP endpoint を自己呼び出しせず、9.1 と同じ配信ランナーを直接起動する
- Cron と内部 POST のどちらから起動しても、line_broadcasts の idempotencyKey により同じ日付の成功配信を二重実行しない

## 10. 非同期処理と状態表示

concern の保存後に、次の処理を非同期で実行する。

- moderation
- ja_hira
- en_translation
- clustering

API が返す concerns.processingStatus は処理全体の概要値とする。個別ジョブの内部状態や外部 AI の生レスポンスは画面向け API に返さない。

| processingStatus | 意味 |
| --- | --- |
| pending | ジョブ登録済みで未開始 |
| processing | いずれかのジョブを実行中 |
| ready | 画面表示に必要な派生データが生成済み |
| failed | 一部失敗。ただし原文は利用可能 |

失敗時の共通ルール:

- concern 自体は削除しない
- published なら原文でフィード表示を継続する
- representation や cluster がない場合は null とする
- クライアントは失敗状態を表示し、無限 polling しない
- 再実行は内部ジョブの責務とし、画面向け API に AI 再実行 endpoint を追加しない

## 11. レート制限とプライバシー

最低限、次の操作をユーザー単位で制限する。

- concern 投稿
- reaction
- quiz answer
- speech transcription

Rate limit を超えた場合は 429 RATE_LIMITED と Retry-After を返す。匿名セッションや IP アドレスを API の認証主体として使わない。

次の情報は API Response、通常ログ、D1 の生データへ保存しない。

- LINE user ID の生値
- LIFF ID token、LINE access token、channel access token
- IP アドレス
- 生音声
- Webhook の生 payload
- users.id を外部に公開する値

投稿本文に個人情報や緊急相談が含まれる可能性があるため、公開前に moderation の判定を通し、判断できない場合は visibilityStatus=pending とする。

## 12. Hono RPC 方針

フロントエンドから直接呼び出す次の endpoint は、Hono RPC の型共有対象とする。

- concerns
- clusters
- quizzes
- history
- speech transcriptions

次の endpoint は通常の画面向け RPC 型から分離する。

- GET /health
- POST /api/v1/webhooks/line
- POST /api/v1/line/broadcasts/daily-quiz

Hono の route chaining の型推論を維持するため、機能単位の route を createApp へ接続する。route の登録順は、固定パス /today をパラメータパス /:quizId より先に登録する。

## 13. 実装順と受け入れ条件

### 13.1 実装順

1. LIFF ID token 検証、users upsert、認証 middleware
2. concerns の作成・一覧・詳細
3. view、reaction、cursor pagination
4. concern の非同期ジョブと cluster
5. quiz の取得・回答
6. history
7. speech transcription
8. LINE Webhook
9. LINE Broadcast API と Cron

### 13.2 API テスト

各 endpoint について、少なくとも次をテストする。

- 正常系の Request / Response
- 必須項目欠落、空文字、範囲外、未知の enum
- 不正・期限切れの LIFF ID token
- 他ユーザーの userId を body に入れた場合に無視されること
- published 以外の concern / quiz が外部へ返らないこと
- reaction の再送で二重加算されないこと
- view の再送で既読履歴が無制限に増えないこと
- quiz answer の participant / concern 重複と回答済み
- cursor の不正と Query 条件の不一致
- 音声 MIME type、サイズ、長さ、外部サービス失敗
- LINE Webhook の署名不正、event 重複、follow / unfollow / text
- LINE Broadcast の成功、失敗、同日再実行、全友だち一斉送信

### 13.3 外部仕様の参照

- [LINE Login v2.1 Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token)
- [LINE Messaging API Broadcast message](https://developers.line.biz/en/reference/messaging-api/#send-broadcast-message)
- [LINE Messaging API Webhook](https://developers.line.biz/en/reference/messaging-api/#webhooks)
