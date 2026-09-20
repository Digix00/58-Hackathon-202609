# 目安箱 API仕様

HTTP APIの共通仕様、エンドポイント、データ形式、エラーを定義する。

## API要件

### 共通仕様

- APIはJSONを利用する
- APIのルートは `/api/v1` とする
- 既存の `GET /health` は運用監視用として維持する
- ブラウザからのAPI URLは `VITE_API_BASE_URL` で設定する
- 本番環境のCORS許可元は `CORS_ORIGIN` で明示する
- Hono RPCでリクエストとレスポンスの型をフロントエンドへ共有する
- エラーは `code`、`message`、`requestId` を含む形式に統一する

### MVPとデモ必須のエンドポイント

| Method | Path | 優先度 | 認証 | 用途 |
| --- | --- | --- | --- | --- |
| GET | `/health` | 現在実装済み | 不要 | WorkerとD1の疎通確認 |
| POST | `/api/v1/concerns` | MVP | 匿名可 | 悩みを投稿する |
| GET | `/api/v1/concerns` | MVP | 匿名可 | 悩みを新着または推薦順で取得する |
| GET | `/api/v1/concerns/:id` | MVP | 匿名可 | 悩みの詳細を取得する |
| POST | `/api/v1/concerns/:id/reactions` | MVP | 匿名可 | リアクションを登録する |
| POST | `/api/v1/concerns/:id/views` | MVP | 匿名可 | 既読を記録する |
| GET | `/api/v1/clusters` | デモ必須 | 匿名可 | クラスタと投稿数を取得する |
| GET | `/api/v1/quiz/today` | デモ必須 | 匿名可 | 3ユーザーと3件の悩みを取得する |
| POST | `/api/v1/quiz/answers` | デモ必須 | 匿名可 | 対応付けクイズの回答を登録する |
| GET | `/api/v1/history` | デモ必須 | セッションまたはLINE | 学習履歴を取得する |
| POST | `/api/v1/speech/transcriptions` | デモ必須 | 匿名可 | 音声を一時的に文字起こしする |
| POST | `/api/v1/webhooks/line` | デモ必須 | LINE署名 | LINEの友だち登録と投稿を受け取る |
| POST | `/api/v1/line/broadcasts/daily-quiz` | デモ必須 | 内部認証 | 友だち登録済みユーザーへクイズを一斉配信する |

### 投稿リクエストの例

```json
{
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "ageGroup": "20s",
  "gender": "回答しない",
  "region": "大阪府",
  "inputMethod": "web"
}
```

`ageGroup`、`gender`、`region`、`inputMethod` は任意とする。`inputMethod` は `web`、`line`、`voice` のいずれかとする。正確な年齢、住所、緯度経度は受け付けない。

### 投稿レスポンスの例

```json
{
  "id": "concern_01J...",
  "body": "食堂が混んでいて、昼休みにゆっくり食べられない",
  "ageGroup": "20s",
  "gender": "回答しない",
  "region": "大阪府",
  "inputMethod": "web",
  "representations": {
    "jaHira": null,
    "en": null
  },
  "cluster": null,
  "reactionCount": 0,
  "createdAt": "2026-09-20T10:00:00.000Z",
  "processingStatus": "pending"
}
```

### HTTPステータス

| Status | 用途 |
| --- | --- |
| 200 | 取得または更新に成功 |
| 201 | 投稿やリアクションの作成に成功 |
| 400 | 入力形式または値が不正 |
| 401 | LINEまたは内部認証に失敗 |
| 403 | 管理操作またはWebhook認証に失敗 |
| 404 | 対象の投稿やクイズが存在しない |
| 409 | 重複登録や状態の競合 |
| 429 | 短時間の過剰な投稿や操作 |
| 500 | 想定外のサーバーエラー |
| 503 | AIや外部サービスが利用できないが、再試行可能 |

