# 目安箱 API仕様

WebブラウザとLINEミニアプリ（LIFF）から利用する、目安箱の HTTP API 契約を定義する。
本書では、実装時に判断が分かれないよう、認証主体、入力値、レスポンス、状態遷移、重複操作、LINE連携の責務を固定する。

本書は [プロダクト要件](../requirements/product.md) の API 境界を定義する文書であり、次の方針を前提とする。

- 公開閲覧 API は、通常ブラウザとLINEミニアプリの未ログイン状態から利用できる
- 投稿、リアクション、既読、クイズ回答、学習履歴、音声入力などの操作 API は、LINEミニアプリ内のLINEログイン済みユーザーだけが利用できる
- LIFF ID token から解決したユーザーには、LINE連携やユーザー単位の履歴を紐づける
- 内部の投稿者識別には users.id を使い、APIのレスポンスには返さない
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

公開閲覧 API は認証ヘッダーなしで利用できる。操作 API は、LINE ID token の検証後に発行される HttpOnly Cookie セッションで認証する。

~~~http
Cookie: __Host-session=<SESSION_TOKEN>  # サーバーが発行し、ブラウザが自動送信
Content-Type: application/json
Accept: application/json
~~~

- 通常の JSON Request / Response は UTF-8 の JSON とする
- 音声文字起こしだけは Content-Type: multipart/form-data を使用する
- JSON のキーは camelCase とする
- 日時は ISO 8601 UTC の文字列（末尾が Z）で返す
- クイズの業務日だけは Asia/Tokyo 基準の YYYY-MM-DD 文字列で返す
- ID は opaque string とし、クライアントは ID の形式や採番規則に依存しない
- クライアントが userId などのユーザー識別子を Request body や Query に指定しても、サーバーは Cookie セッションから解決した認証主体を使う
- 空文字列は未指定として扱わず、必須項目では validation error とする
- 任意項目を指定しない場合は、原則としてキー自体を省略する

### 1.3 認証

認証方式はエンドポイントごとに固定する。

| 認証方式 | 対象 | 認証方法 |
| --- | --- | --- |
| 公開閲覧（認証不要） | フィード、投稿詳細、公開クラスタ | 認証ヘッダーなし。通常ブラウザと未ログインのLIFFから利用 |
| LINE認証済みセッション | 投稿、リアクション、既読、クイズ、履歴、音声入力 | `POST /api/v1/auth/line` 後の HttpOnly Cookie を自動送信 |
| LINE 署名 | LINE Webhook | x-line-signature を channel secret で検証 |
| 内部認証 | LINE Broadcast API を起動する内部 API | Authorization Bearer に内部トークンを指定 |
| 不要 | 公開閲覧 API、GET /health | 公開閲覧 API は書き込みや個人履歴を扱わず、health は Worker / D1 の疎通確認のみ |

#### LIFF 認証の処理

1. フロントエンドが LIFF SDK の liff.init と liff.login を実行する
2. フロントエンドが liff.getIDToken で ID token を取得する
3. フロントエンドが `POST /api/v1/auth/line` の JSON body に ID token を指定する
4. バックエンドが LINE Login v2.1 の Verify ID token API へ ID token と期待する channel ID を送る
5. 検証結果の subject（LINE user ID）から users.id を解決または upsert する
6. バックエンドが HttpOnly Cookie のセッションを発行し、以降の API へ自動送信させる
7. 以降のユースケースには、クライアント入力ではなく解決済み users.id を渡す

`POST /api/v1/auth/line` と `GET /api/v1/auth/session` の認証済みレスポンスには、
ログインユーザー自身のプロフィール情報と `profileCompleted` を含める。プロフィール未入力の
ユーザーは `profileCompleted=false` となり、`PUT /api/v1/users/me` で登録する。

次の値は信頼しない。

- Request body や Query に含まれる userId
- クライアントが独自に生成したユーザー識別子
- ID token を検証せずに JWT の payload だけをデコードした値

ID token の検証に失敗した場合は 401 INVALID_ID_TOKEN を返す。生の ID token、LINE user ID、アクセストークンはレスポンスや通常ログへ出力しない。

#### 廃止仕様: 匿名セッション認証の処理

以下は旧仕様の記録であり、現行MVPでは匿名セッションを発行・利用しない。公開閲覧は認証ヘッダーなしで行い、操作 API はLINEログイン済みのLIFFから利用する。

1. Webブラウザが `POST /api/v1/sessions/anonymous` を呼び出す
2. サーバーが有効期限付きの高エントロピーな opaque session ID を発行する
3. クライアントは以降の画面向け API に `X-Anonymous-Session-Id` を指定する
4. バックエンドがセッションの有効期限を検証し、匿名の認証主体として解決する
5. セッションの有効期限が切れた場合や不正な場合は 401 INVALID_ANONYMOUS_SESSION を返す

匿名セッションIDはユーザー識別子ではなく認証用の秘密値として扱い、レスポンス以外の通常ログや画面表示へ出力しない。LIFF ID token と匿名セッションIDの両方が指定された場合は 400 INVALID_REQUEST とする。匿名セッション作成 API のレスポンスには `Cache-Control: no-store` を設定する。

匿名セッションは有効期間内の投稿、既読、リアクション、クイズ回答、学習履歴に利用できる。LINE連携が必要な処理は LIFF 認証済みユーザーまたは LINE Webhook の認証済みユーザーとして扱う。

#### POST /api/v1/sessions/anonymous

匿名セッションを作成する。Request body は持たず、発行回数はレート制限する。

#### Response: 201 Created

~~~json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-09-28T00:00:00.000Z"
}
~~~

- sessionId はサーバーが生成する高エントロピーな opaque string とし、クライアントが内容を解釈・生成してはならない
- expiresAt は ISO 8601 UTC とする
- レスポンスにはユーザー情報、LINE user ID、users.id を含めない
- セッション作成後は、画面向け API の各リクエストへ X-Anonymous-Session-Id を指定する

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
| 401 | 認証情報がない、または無効 | AUTHENTICATION_REQUIRED、INVALID_ID_TOKEN、INVALID_ANONYMOUS_SESSION、INVALID_LINE_SIGNATURE |
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
- 50s
- 60s
- 70s
- 80s
- 90s_plus
- no_answer

#### 性別

- male
- female
- non_binary
- other
- no_answer

#### 地域（都道府県）

`regionCode` は、バックエンドの `REGION_CODES`（`backend/src/application/entity/region-code.ts`）で定義された47都道府県コードのいずれかを指定する。`regions` テーブルや外部マスタは参照しない。自由入力と広域区分（例: `kansai`）は受け付けず、`osaka` のような都道府県コードだけを受け付ける。

#### 投稿の公開状態

- published: 保存直後から一般フィードへ公開可能。PoCでは新規投稿の初期値とする
- hidden: システムが明示的に非公開にした状態
- deleted: 削除済み。外部の画面向け API には返さない

#### 投稿の処理状態

- pending: 翻訳・ひらがな化・クラスタリングのジョブが未開始
- processing: 翻訳・ひらがな化・クラスタリングのいずれかを実行中
- ready: 必要な派生データの生成が完了
- failed: 一部処理に失敗したが原文は利用可能

representations.jaHira と representations.en は、作成 API では未生成時に null、一覧・詳細 API では pending、ready、failed の状態値を返す。ready の本文は language の選択対象となり、pending または failed の場合は原文へフォールバックする。

### 1.7 ページネーション

一覧 API は cursor pagination を利用する。

- limit の既定値は 20、指定可能な範囲は 1〜50
- cursor はサーバーが発行する opaque string とする
- クライアントは cursor をデコード・編集してはならない
- cursor が不正、期限切れ、または sort、clusterId、gender、regionCode の Query 条件と一致しない場合は 400 INVALID_CURSOR を返す
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
| POST | /api/v1/auth/line | 実装済み | LIFF ID token | LINE ID token を検証し、Cookie セッションを発行 |
| GET | /api/v1/auth/session | 実装済み | 任意（Cookie） | ログイン状態を復元し、Cookie がない場合は未認証セッションを発行 |
| POST | /api/v1/auth/logout | 実装済み | 任意（Cookie） | セッションを失効させ、Cookie を削除 |
| PUT | /api/v1/users/me | 実装済み | LINEログイン済みセッション | ログインユーザー自身のプロフィールを更新 |
| POST | /api/v1/sessions/anonymous | 廃止 | 不要 | 旧仕様。匿名セッション作成（現行MVPでは提供しない） |
| POST | /api/v1/concerns | MVP | LINEログイン（LIFF内のみ） | 悩み投稿 |
| GET | /api/v1/concerns | MVP | 不要（閲覧のみ） | 新着または推薦フィード |
| GET | /api/v1/concerns/:concernId | MVP | 不要（閲覧のみ） | 悩み詳細 |
| POST | /api/v1/concerns/:concernId/reactions | MVP | LINEログイン（LIFF内のみ） | リアクション登録 |
| POST | /api/v1/concerns/:concernId/views | MVP | LINEログイン（LIFF内のみ） | 既読登録 |
| GET | /api/v1/clusters | デモ必須 | 不要（閲覧のみ） | 公開クラスタ一覧 |
| GET | /api/v1/clusters/:clusterId/concerns | デモ必須 | 不要（閲覧のみ） | クラスタ内の悩み |
| GET | /api/v1/quizzes/today | デモ必須 | LINEログイン（LIFF内のみ） | Asia/Tokyo の当日クイズ |
| GET | /api/v1/quizzes/:quizId | デモ必須 | LINEログイン（LIFF内のみ） | 指定クイズ |
| POST | /api/v1/quizzes/:quizId/answers | デモ必須 | LINEログイン（LIFF内のみ） | 対応付け回答 |
| GET | /api/v1/history/summary | デモ必須 | LINEログイン（LIFF内のみ） | 閲覧・クラスタ・都道府県・属性・クイズ集計 |
| GET | /api/v1/history/quiz-answers | デモ必須 | LINEログイン（LIFF内のみ） | クイズ回答履歴 |
| POST | /api/v1/speech/transcriptions | デモ必須 | LINEログイン（LIFF内のみ） | 音声の一時文字起こし |
| POST | /api/v1/webhooks/line | デモ必須 | LINE 署名 | follow / unfollow（text messageは投稿に利用しない） |
| POST | /api/v1/line/broadcasts/daily-quiz | デモ必須 | 内部認証 | 全友だちへクイズを一斉配信 |

userId を受け取る API、ユーザーごとに Push API を呼び出す配信 API は実装しない。公開閲覧は通常ブラウザと未ログインのLINEミニアプリから利用し、操作 API はLINEログイン済みのLIFFから利用する。

### 2.1 PUT /api/v1/users/me

LINEログイン済みユーザー自身のプロフィールを更新する。ユーザー識別子はリクエストから受け取らず、
HttpOnly Cookieのセッションから解決する。プロフィールは初回ログイン後に登録する。

#### Request

~~~json
{
  "birthYear": 2002,
  "birthMonth": 9,
  "gender": "no_answer",
  "regionCode": "hyogo"
}
~~~

- `birthYear` は1900年から現在年までの整数とする
- `birthMonth` は1〜12の整数とし、現在年の場合は現在月以降の未来の月を受け付けない
- 生年月日は日まで保持せず、年と月だけを保存する
- `gender` は `male`、`female`、`non_binary`、`other`、`no_answer` のいずれかとする
- `regionCode` はバックエンドの `REGION_CODES` に定義された47都道府県コードのいずれかとする

#### Response: 200 OK

~~~json
{
  "authenticated": true,
  "user": {
    "id": "opaque-user-id",
    "birthYear": 2002,
    "birthMonth": 9,
    "gender": "no_answer",
    "regionCode": "hyogo",
    "profileCompleted": true
  }
}
~~~

`id` は既存の認証レスポンスとの互換性のために返す内部 opaque IDであり、LINE user IDは返さない。
未認証の場合は401 `AUTHENTICATION_REQUIRED`、入力値が不正な場合は400 `INVALID_REQUEST`を返す。

## 3. 悩み API

### 3.1 POST /api/v1/concerns

LIFFでLINEログイン済みのユーザーの悩みを保存する。PoCでは人手のモデレータを置かず、受け付けた投稿を保存直後から公開する。翻訳・ひらがな化・クラスタリングは非同期で実行し、完了を待たずに返す。

#### Request

~~~json
{
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "ageGroup": "20s",
  "gender": "no_answer",
  "regionCode": "osaka"
}
~~~

#### Validation

- body は必須。前後の空白を trim した後、1〜1000 文字
- ageGroup は任意。指定時は定義済みの年代コードだけを受け付ける
- gender は任意。指定しない場合はキーを省略し、明示的に回答しない場合は no_answer を指定する
- regionCode は任意。指定時は `REGION_CODES` に定義された47都道府県コードだけを受け付ける
- ユーザー識別子は Request body に含めない
- 正確な年齢、住所、緯度経度、IP アドレスは受け付けない
- 本文の個人情報や緊急性の判定は PoC の API 責務に含めない。実在の個人情報や緊急相談をデモデータに使用しない

#### 処理

1. LIFF ID token を検証し、認証主体を解決する
2. Request を validation する
3. concerns を visibilityStatus=published で保存する
4. ja_hira、en_translation、clustering の非同期ジョブを登録する
5. 投稿 ID と保存時点の状態を返す
6. Queue consumerがひらがな・英語表現とEmbeddingを生成し、Vectorizeで近傍照合する。D1へ表現とcluster IDを保存し、VectorizeへEmbeddingをupsertした後に processingStatus を更新する

#### Response: 201 Created

~~~json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "attributes": {
    "ageGroup": "20s",
    "gender": "no_answer",
    "regionCode": "osaka"
  },
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

- PoCで受け付けた新規投稿は visibilityStatus=published、processingStatus=pending で返す
- 投稿本文の翻訳・ひらがな化・クラスタリングが未完了でも、published の原文投稿は一般フィードへ返す
- Vectorizeは投稿処理内のクラスタリングに限って使い、利用者が任意の文章を送る検索APIやRAGは提供しない
- 近傍上位10件を調べ、cosine scoreが既定値0.8以上の最上位clusterへ割り当てる。類似候補のない投稿は新しいclusterを作成する
- Vectorizeへのupsertは検索可能になるまで遅延することがあり、短時間に連続した投稿を最初の処理で同じclusterへ割り当てられない場合がある
- 近傍検索の設定はEmbedding modelとVectorize indexの組に固定する
- クラスタの表示ラベルと要約を生成する処理は後続のため、生成前はcluster.label、cluster.summaryがnullの場合がある
- hidden または deleted の投稿は一般フィードへ返さない
- 保存成功後の外部処理失敗では投稿を削除しない
- 既存の入力制限に該当する場合は 400 または 422 を返し、保存しない

### 3.2 GET /api/v1/concerns

公開済みの悩みを、対象ユーザー向けのフィードとして返す。

#### Query

| Param | 必須 | 既定値 | 内容 |
| --- | --- | --- | --- |
| limit | 任意 | 20 | 1〜50 |
| cursor | 任意 | — | 次ページの opaque cursor |
| sort | 任意 | newest | recommended または newest。recommended はLINEログイン済みLIFFのみ |
| clusterId | 任意 | — | 指定クラスタに絞る |
| gender | 任意 | — | `male`、`female`、`non_binary`、`other`、`no_answer` のいずれか。性別コードの完全一致で絞る |
| regionCode | 任意 | — | 指定した都道府県に絞る |
| language | 任意 | original | original、jaHira、en |

#### Response: 200 OK

~~~json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
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
        "label": null,
        "summary": null
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
- hidden、deleted の投稿は 404 と区別せず、一覧から除外する
- gender を指定した場合は、投稿の gender コードが指定値と完全一致する投稿だけを返す
- language で指定した表現が ready でない場合は原文を body に返し、language は original とする
- representation の値が failed でも原文は返す
- viewed と reacted はLINEログイン済みユーザー自身の状態であり、公開閲覧では false とする
- sort=recommended はLINEログイン済みLIFFだけが指定でき、未読、クラスタの分散、都道府県の分散、新しさを使う
- 未ログインの取得で sort=recommended を指定した場合は 400 AUTHENTICATION_REQUIRED を返す
- 推薦に必要な処理が失敗した場合は strategy=fallback として newest 相当で返す
- 推薦理由の code は画面側で表示文言へ変換する。サーバーは内部のスコアや個人識別情報を返さない

reasonCode の初期値は次のとおり。

- unread_cluster: 未読のクラスタを優先
- new_cluster: 最近読んでいないクラスタを優先
- region_diversity: 都道府県の偏りを避けるため選択
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
  "concernId": "550e8400-e29b-41d4-a716-446655440001",
  "reactionType": "empathy",
  "reactionCount": 13,
  "reacted": true
}
~~~

- hidden、deleted の悩みには登録できない
- LINEログイン済みセッションがない場合は 401 AUTHENTICATION_REQUIRED を返す
- reactionType が欠落または未対応の場合は 400 INVALID_REQUEST を返す
- 存在しない、hidden、deleted の concernId は 404 NOT_FOUND とする
- concernId と解決済みの認証主体と reactionType の組を一意にする
- 他ユーザーのリアクションを解除・変更する API は提供しない
- 同じ操作の再送は成功扱いとし、409 にはしない

### 3.5 POST /api/v1/concerns/:concernId/views

公開中の悩みをLINEログイン済みユーザーの既読として記録する。Request body は持たない。フロントエンドは本文の表示完了後に1回呼び出す。

#### Response: 200 OK

~~~json
{
  "concernId": "550e8400-e29b-41d4-a716-446655440001",
  "viewed": true,
  "viewedAt": "2026-09-21T00:10:00.000Z"
}
~~~

- 同じ concernId と actor_key の組は一行に集約し、再送時も最初の viewedAt を返す
- actor_key は認証セッションから解決した内部 users.id とし、LINE user ID は保存・返却しない
- 未ログイン時は 401 AUTHENTICATION_REQUIRED
- hidden、deleted、存在しない concernId は 404 NOT_FOUND とする

## 4. クラスタ API

### 4.1 GET /api/v1/clusters

公開済みの悩みを含むクラスタを返す。

#### Query

- limit: 1〜50、既定値 20
- cursor: opaque cursor
- regionCode: 任意。クラスタ内の公開済み悩みを都道府県で絞る

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

クイズ取得 API（5.2、5.3）は、次の Query を受け付ける。

| Param | 必須 | 既定値 | 内容 |
| --- | --- | --- | --- |
| language | 任意 | original | original、jaHira、en |

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
        "regionCode": "kyoto"
      },
      "displayOrder": 2
    },
    {
      "participantId": "participant_c",
      "attributes": {
        "ageGroup": "no_answer",
        "gender": "no_answer",
        "regionCode": "hyogo"
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
- 3 件の participants は、ageGroup、gender、regionCode の各属性がそれぞれ重複しない組み合わせにする。未入力値は `no_answer` として扱う
- participantId は当該クイズ内だけで利用する opaque ID とし、users.id や LINE user ID を使わない
- concernId は公開済みの元投稿を参照するが、参加者との正しい対応は返さない
- 3 件の concern は実際の投稿であり、架空の選択肢は作らない
- Query の language で指定した表現が ready の場合はその本文と language を返し、pending、failed、未生成の場合は原文の本文と language=original にフォールバックする
- language が不正な場合は 400 INVALID_REQUEST とする
- クイズ生成後に元投稿が hidden または deleted になった場合は、クイズ自体を hidden として公開しない
- answered=true の場合は answerResult を追加し、同じ quiz の回答結果を表示できるようにする

### 5.2 GET /api/v1/quizzes/today

Asia/Tokyo の現在日付に対応する published クイズを返す。

- 当日クイズが存在しない、または元投稿が公開できない場合は 404 QUIZ_NOT_AVAILABLE
- Query は 5.1 の language を受け付ける
- Response は 5.1 の共通形式
- ルート実装では /today を /:quizId より先に登録し、today が quizId として解釈されないようにする

### 5.3 GET /api/v1/quizzes/:quizId

指定した published クイズを返す。

- Query は 5.1 の language を受け付ける
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
- 回答者の userId は Request body から取得せず、検証済みの LIFF ID token から解決した認証主体を使う
- 同じ quiz に対する同じユーザーの回答は上書きしない

#### Response: 201 Created

~~~json
{
  "quizId": "quiz_2026-09-21",
  "score": 1,
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

学習履歴は、LINEログイン済みLIFFの現在の認証主体自身のデータだけを返す。

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
  "attributes": {
    "ageGroups": [
      {
        "ageGroup": "20s",
        "count": 5
      }
    ],
    "genders": [
      {
        "gender": "female",
        "count": 4
      }
    ]
  },
  "quiz": {
    "answeredCount": 3,
    "correctCount": 7,
    "totalQuestions": 9,
    "accuracy": 0.7778
  }
}
~~~

- viewedConcernCount はユーザーが既読にした公開投稿の distinct 件数
- clusters と `regions` は、既読履歴に現れた公開投稿を集計する。`regions` は都道府県コード別の集計結果であり、マスタテーブルの参照結果ではない
- attributes.ageGroups と attributes.genders は、既読履歴に現れた公開投稿を属性値ごとに集計する
- 各属性の count は同じ投稿を複数回既読にしても重複しない distinct 件数とし、値が未設定の投稿はその属性の集計から除外する
- quiz.answeredCount は回答済みクイズ数
- accuracy は correctCount / totalQuestions。totalQuestions が 0 の場合は 0
- LIFF / LINE ユーザーで users.deleted_at が設定された場合は 403 USER_DELETED とする
- 期限切れまたは無効な匿名セッションは 401 INVALID_ANONYMOUS_SESSION とする（旧仕様のみ）
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
      "score": 1,
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
- 文字起こし結果をユーザーが編集してから、編集後の本文で concerns API を呼ぶ
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
- 未対応 event type も webhookEventId と event_type を line_webhook_events に status=ignored として記録し、業務処理は行わず 200 OK を返す
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

### 8.4 text message event（旧仕様）

旧仕様では user source から受信した text を悩み本文として扱っていた。現行MVPではLINEのtext messageを投稿受付に利用せず、悩みの投稿はLINEミニアプリの投稿フォームから行う。以下は旧仕様の記録として残す。

1. event.source.userId から内部 users.id を解決する
2. text を trim し、1〜1000 文字で validation する
3. concerns を保存する
4. Web 投稿と同じ非同期処理ジョブを登録する
5. replyToken が有効な間に受付結果を reply message で返す

- text が不正な場合は投稿を保存せず、修正を促す reply message を返す
- 画像、スタンプ、位置情報など未対応 message type は投稿として保存しない
- group source や room source は MVP 対象外とし、line_webhook_events に status=ignored として記録したうえで、ユーザー単位の投稿処理はしない
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
6. LINEミニアプリのクイズ URL を含む同一メッセージを LINE 公式アカウントの全友だちへ送信する
7. line_broadcast_attempts に試行結果、HTTP status、X-Line-Request-Id、X-Line-Accepted-Request-Id、Retry Key を記録する
8. 成功時は line_broadcasts を succeeded にし、送信時刻を保存する

重要な制約:

- users を全件走査して、ユーザーごとに Push API を呼び出してはならない
- 受信者ごとの delivery 行は作成しない
- LINE Broadcast API の全友だち配信を一回の論理実行として扱う
- アプリケーションの idempotencyKey と LINE API の Retry Key は別に管理する
- LINE API の応答が不明な状態で再試行する場合は、同じ論理リクエストの Retry Key を再利用して二重配信を抑止する
- response の status=succeeded は LINE Broadcast API が一回の論理リクエストを受理したことを示すもので、全友だちの個別配信完了や個別 delivery status を表さない
- LINE API が 409 と X-Line-Accepted-Request-Id を返した場合は、先行リクエストが受理済みであるため attempt を論理成功として扱い、BROADCAST_UPSTREAM_UNAVAILABLE にはしない
- BROADCAST_IN_PROGRESS はアプリケーション内で同じ idempotencyKey の runner が並行実行中の場合だけに用い、LINE API の 409 とは区別する

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

同じ idempotencyKey の配信が running 中の場合は、二つ目の LINE API 呼び出しを行わず、409 BROADCAST_IN_PROGRESS を返す。これはアプリケーション内の同時実行を示す。

LINE API がタイムアウトなどで結果不明になった場合は、同じ Retry Key で再試行する。LINE API が 409 と X-Line-Accepted-Request-Id を返した場合は、先行リクエストの受理を確認できるため、その attempt を成功として line_broadcasts を succeeded に更新し、次回以降は既存の 200 OK を返す。

LINE API が一時的に失敗した場合は、失敗した attempt を保存したうえで 503 BROADCAST_UPSTREAM_UNAVAILABLE を返す。failed の配信は同じ quizDate の idempotencyKey で再試行する。

### 9.2 Cloudflare Cron

- Cron の実行時刻は UTC として受け取る
- 実行対象の quizDate は Asia/Tokyo へ変換して決める
- scheduled handler は HTTP endpoint を自己呼び出しせず、9.1 と同じ配信ランナーを直接起動する
- Cron と内部 POST のどちらから起動しても、line_broadcasts の idempotencyKey により同じ日付の成功配信を二重実行しない

### 9.3 APIレスポンスとDBの責務

- この API は受信者一覧、ユーザーごとの送信結果、個別 delivery status を返さない
- status=succeeded は LINE Broadcast API のリクエスト受理を意味し、LINE 公式アカウントの友だち全員への個別配信完了を意味しない
- アプリケーションの broadcastId / idempotencyKey と、LINE API の Retry Key / Request ID は別の識別子として扱う
- DBの物理カラムや制約は #32 の database.md で定義し、この PR は HTTP の認証、Request/Response、状態コード、冪等性の契約を定義する

## 10. 非同期処理と状態表示

concern の保存後に、次の処理を非同期で実行する。

PoCでは `concern.process` メッセージをCloudflare Queueへ送信し、Queue consumerからUseCaseを起動する。生成したひらがな・英語表現とcluster IDはD1へ、EmbeddingはCloudflare Vectorizeへ保存する。個別ジョブ単位の状態を持つ `concern_processing_jobs` テーブルはこの段階では追加しない。

- ja_hira
- en_translation
- Embedding生成とクラスタ割当

API が返す concerns.processingStatus は、表現生成・保存とEmbedding生成・クラスタ割当の概要値とする。個別ジョブの内部状態や外部 AI の生レスポンスは画面向け API に返さない。クラスタの表示ラベル・要約は後続処理のため、処理完了後もnullの場合がある。

| processingStatus | 意味 |
| --- | --- |
| pending | ジョブ登録済みで未開始 |
| processing | いずれかのジョブを実行中 |
| ready | 表現の保存とEmbeddingの近傍照合・クラスタ割当が完了。クラスタの表示ラベル・要約は後続処理のためnullの場合がある |
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

Rate limit を超えた場合は 429 RATE_LIMITED と Retry-After を返す。現行仕様では公開閲覧に認証主体を使わず、操作 API ではLINEログイン済みの users.id を認証主体として使う。旧仕様では匿名セッションを認証主体としていたが、現行MVPでは利用しない。IP アドレスを認証主体やユーザー識別子として使わない。

次の情報は API Response、通常ログ、D1 の生データへ保存しない。

- LINE user ID の生値
- LIFF ID token、LINE access token、channel access token
- IP アドレス
- 生音声
- Webhook の生 payload
- users.id を外部に公開する値

PoCでは公開前の人手確認や自動判定を行わない。実在の個人情報や緊急相談を含むデータは使用せず、受け付けた投稿は保存直後から published として扱う。

## 12. Hono RPC 方針

フロントエンドから直接呼び出す次の endpoint は、Hono RPC の型共有対象とする。

- concerns
- concern reactions
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

1. LIFF ID token 検証、users upsert、認証 middleware（匿名セッション作成は旧仕様のため実装しない）
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
- 匿名セッションID の検証（旧仕様のみ）
- 他ユーザーの userId を body に入れた場合に無視されること
- published 以外の concern / quiz が外部へ返らないこと
- reaction の再送で二重加算されないこと
- view の再送で concern_views の行が重複しないこと
- quiz answer の participant / concern 重複と回答済み
- cursor の不正と Query 条件の不一致
- 音声 MIME type、サイズ、長さ、外部サービス失敗
- LINE Webhook の署名不正、event 重複、follow / unfollow / text
- LINE Broadcast の成功、失敗、同日再実行、全友だち一斉送信

### 13.3 外部仕様の参照

- [LINE Login v2.1 Verify ID token](https://developers.line.biz/en/reference/line-login/#verify-id-token)
- [LINE Messaging API Broadcast message](https://developers.line.biz/en/reference/messaging-api/#send-broadcast-message)
- [LINE Messaging API Webhook](https://developers.line.biz/en/reference/messaging-api/#webhooks)
