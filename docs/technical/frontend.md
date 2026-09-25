# フロントエンド実装指針

## 目的

本ドキュメントは、LINEミニアプリを主対象とするフロントエンドの実装方針と、UI・バックエンド連携の責務を定める。

画面の要件・文言・状態は `docs/requirements/screens/` を正とし、本ドキュメントでは実装責務を定める。

## スコープ

### スコープ

- 主対象はLINEミニアプリとする。
- 通常Webは、公開フィード(`/`)と投稿詳細(`/concerns/:id`)の閲覧を提供する。
- 通常Web向けのPCレイアウトや、投稿・リアクションなどの操作は作り込まない。
- GitHub Issueの実装対象は `frontend` ラベル付きIssueを基本とする。
- 画面詳細の未定義項目は、親子Issueを新設せず、既存の該当画面Issueへ分配して扱う。

## UIとデータ連携の境界

Container/Presentationalパターンを基本とし、feature単位で責務を分ける。各featureを独立した変更単位として扱い、画面・API接続・状態管理を同じfeature内へ集約する。アプリ全体に厳格なClean Architectureを導入せず、外部SDKとAPIの境界を明確にするために必要な分だけ層を設ける。

複数ステップの投稿・音声入力・クイズ回答では、状態遷移を明示して無効な組み合わせを作らない。状態機械用のライブラリをアプリ全体へ導入するのではなく、まず `useReducer` と型で局所的に表現する。

### Container

Containerは次を担当する。

- API通信とHono RPCクライアントの呼び出し
- LIFFの初期化、ログイン状態、通常Web/LIFFの実行環境判定
- ルーティングとログイン案内への分岐
- loading、error、empty、successの状態管理
- 投稿フォーム・クイズなどの複数ステップ状態
- API DTOから画面用ViewModelへの変換

例:

```tsx
<FeedPageContainer>
  <FeedView />
</FeedPageContainer>
```

### Presentational

Presentationalコンポーネントは次を担当する。

- propsで受け取ったViewModelの表示
- ユーザー操作をコールバックで通知
- semantic HTML、キーボード操作、ARIA属性
- CSS、レイアウト、ローディング・エラー表示の見た目

Presentationalコンポーネントから、API、LIFF SDK、`localStorage`、URL操作を直接呼び出さない。モックのpropsだけで表示確認できる状態を保つ。

## ディレクトリ構成

```text
frontend/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── AppShell.tsx
│   └── providers/
├── features/
│   ├── entry/
│   ├── feed/
│   ├── concern-detail/
│   ├── post/
│   ├── quiz/
│   └── history/
├── auth/                   # 認証状態とログイン操作の境界
├── shared/
│   ├── components/
│   ├── ui/
│   ├── hooks/
│   └── styles/
├── lib/
│   └── api.ts              # Hono RPCクライアント
└── infrastructure/
    └── liff/               # LIFF SDKの具体実装
```

各featureでは、次の構成を基本とする。

```text
features/feed/
├── FeedPageContainer.tsx
├── FeedView.tsx
├── FeedCard.tsx
├── useFeed.ts
├── feedApi.ts
├── feedTypes.ts
└── feedViewModel.ts
```

小さな部品まで機械的にContainerとPresentationalへ分割せず、画面全体または複雑な操作単位で分離する。

`shared/` には複数featureで再利用され、特定の業務用語を持たないUI部品だけを置く。特定の画面や悩み・クイズなどの業務概念を持つ部品は、再利用される場合もfeature内に置く。再利用実績のない部品を先回りして共通化しない。

## CSS の構成と依存方向

グローバル CSS は `src/styles/` に置き、トークン、リセット、全画面共通のフォーカス表示などに限定する。アプリ起動時に `styles/index.css` から一度だけ読み込む。

- `app/`、`shared/components/`、`features/` の見た目は、それぞれのコンポーネントと同じディレクトリの `*.module.css` に置く。
- 複数箇所で利用実績のある装飾・操作スタイルだけを `shared/styles/` に置く。feature は `shared` を参照してよいが、`shared` の CSS・コンポーネントから feature のクラスや DOM 構造を参照してはならない。
- 親コンポーネントが子コンポーネントの内部クラスを子孫セレクタで装飾しない。横断的な表示設定は CSS Custom Property または明示的な props で渡す。
- CSS Modules 間の `composes` による隠れた結合は作らない。共有したい構造・見た目は、共有 UI コンポーネントまたは `shared/styles/` の明示的な export として扱う。
- Vite 標準の CSS Modules を利用し、スタイルのためだけに CSS-in-JS やユーティリティ CSS の依存を追加しない。

## LINEミニアプリとルーティング

LIFF SDKは `infrastructure/liff/` に閉じ込め、画面から直接呼び出さない。画面側が参照するのは、次のようなアプリケーション状態だけとする。

```ts
type RuntimeMode = "browser" | "liff";
type AuthState = "initializing" | "anonymous" | "authenticated" | "unavailable";
```

操作系画面への遷移は、次のルールに統一する。

| 状態                                                | 表示                     |
| --------------------------------------------------- | ------------------------ |
| 通常Webで `/post`、`/quiz/today`、`/history` を開く | LINEミニアプリで開く案内 |
| LIFF内の未ログイン利用者が操作する                  | LINEログイン案内         |
| LIFF内でログイン済み                                | 対象画面を表示           |
| ログイン中止・失敗                                  | 元の閲覧画面へ戻る       |
| LIFF初期化失敗                                      | 公開フィード・投稿詳細を新着順で閲覧できる。失敗案内を表示し、操作系画面は通常Webと同様にLINEへ案内する |

LINE user ID、アクセストークン、プロフィール情報はURL、ログ、画面表示、`localStorage` に保存しない。

## データ取得とAPI接続

- API通信は `frontend/src/lib/api.ts` のHono RPCクライアントを利用する。
- 生のAPIクライアントはContainer、featureのAPI adapter、custom hookからのみ利用する。
- `API DTO → feature API / hook → ViewModel → Presentational View` の順に変換する。
- APIのエラーコードは画面向けの日本語メッセージへ変換する。
- 投稿、リアクション、クイズ回答は送信中にボタンを無効化する。
- 通信失敗時は投稿本文やクイズの選択内容を保持する。
- LINE user IDやアクセストークンをフロントエンドのログへ出力しない。

### 作業の進め方

1. APIの入力・出力・エラー形式を確定する。
2. 共同でfeatureのViewModelとloading/error/empty状態を確認する。
3. Viewと表示コンポーネントをモックデータで実装する。
4. Container、custom hook、API adapterを実装する。
5. 実APIへ接続し、モバイル幅・キーボード操作・通信失敗を確認する。

責務が同じファイルに集中しないよう、可能な限り `components` / `View` と `Container` / `api` / `hooks` を分けて変更する。

## 状態・アクセシビリティ

- 単一または単純なまとまりの画面固有状態は `useState` を使う。
- 投稿フォーム、音声文字起こし、クイズ回答など、状態同士が依存する複数ステップの操作は `useReducer` を使う。状態と許可するアクションを型で表し、送信中に再送信できるなどの無効な状態を作らない。
- 認証状態や表示設定など、複数画面で共有する最小限の状態だけProviderで管理する。
- URLには投稿IDやクイズIDなど、共有・復元が必要な識別子だけを持たせる。フォーム入力値、LINE認証情報、画面内だけで完結する状態はURLへ置かない。
- APIレスポンスはfeatureのHookまたはContainerで管理する。カーソルページング、再取得、楽観更新、複数画面での同じサーバー状態の共有が複雑になった場合に限り、TanStack Queryなどのサーバー状態ライブラリの導入を検討する。導入時もDTOからViewModelへの変換境界は維持する。
- Custom Hookの責務分割、境界、状態モデリングの詳細は [React Custom Hooks スタイルガイド](./react-hooks-style-guide.md) に従う。
- 色だけで状態を伝えず、文言・ARIA属性・ボタン状態を組み合わせる。
- 送信結果、エラー、リアクション結果は `aria-live` で通知する。
- 主要操作はキーボードだけで完了できるようにする。
- 設定など独立した画面はURLで移動し、見出しと下部ナビからキーボード操作を続けられるようにする。
- 360px幅、長文、文字サイズ拡大、ソフトウェアキーボード表示で横スクロールや操作の欠落を起こさない。

## GitHub Issueとの対応

実装のスコープは `frontend` ラベル付きIssueとする。画面固有の状態・例外は、各画面詳細設計を正として実装する。

### 画面・機能Issue

| 画面・機能           | UI実装Issue                                                     | API接続時の参照Issue                                            |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| LINE認証・起動       | [#90](https://github.com/Digix00/58-Hackathon-202609/issues/90) | 同Issue                                                         |
| フィード・投稿詳細   | [#64](https://github.com/Digix00/58-Hackathon-202609/issues/64) | [#63](https://github.com/Digix00/58-Hackathon-202609/issues/63) |
| 投稿フォーム         | [#60](https://github.com/Digix00/58-Hackathon-202609/issues/60) | [#59](https://github.com/Digix00/58-Hackathon-202609/issues/59) |
| リアクション         | [#67](https://github.com/Digix00/58-Hackathon-202609/issues/67) | [#66](https://github.com/Digix00/58-Hackathon-202609/issues/66) |
| クラスタリング       | [#72](https://github.com/Digix00/58-Hackathon-202609/issues/72) | [#71](https://github.com/Digix00/58-Hackathon-202609/issues/71) |
| レコメンド           | [#75](https://github.com/Digix00/58-Hackathon-202609/issues/75) | [#74](https://github.com/Digix00/58-Hackathon-202609/issues/74) |
| 音声入力・多言語表示 | [#78](https://github.com/Digix00/58-Hackathon-202609/issues/78) | [#77](https://github.com/Digix00/58-Hackathon-202609/issues/77) |
| 今日のクイズ         | [#81](https://github.com/Digix00/58-Hackathon-202609/issues/81) | [#80](https://github.com/Digix00/58-Hackathon-202609/issues/80) |
| 学習履歴             | [#87](https://github.com/Digix00/58-Hackathon-202609/issues/87) | [#86](https://github.com/Digix00/58-Hackathon-202609/issues/86) |

## 完了条件

### UI実装

- 対象画面の表示、入力、画面遷移がモックデータで確認できる。
- loading、empty、error、送信中、完了状態が表示できる。
- 主要操作をキーボードだけで完了できる。
- 360px幅、長文、文字サイズ拡大でレイアウトが崩れない。

### データ連携

- Hono RPC経由でAPIを呼び出している。
- API DTOとViewModelが分離されている。
- API失敗時に入力・選択内容が保持される。
- 認証情報や個人を特定する情報がURL・ログ・画面へ漏れない。
- 次のコマンドが成功する。

```bash
pnpm --filter frontend format:check
pnpm --filter frontend lint
pnpm --filter frontend build
```

画面の見た目・操作は `make dev` でバックエンドとフロントエンドを起動し、LINEミニアプリ相当のモバイル幅で確認する。
