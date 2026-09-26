# LINEミニアプリ固有の挙動とフロントエンド編集ガイド

## この文書の使い方

フロントエンドを編集するAIエージェント・開発者は、画面設計とあわせて本書を読む。LINE内での起動、認証、画面遷移、表示領域に関する前提をまとめ、通常Web向けの変更でミニアプリの動作を壊さないための参照先とする。

「プロジェクト仕様」は実現すべき挙動、「現行実装」はコードで確認できる挙動、「LINE側の制約」は公式資料に基づく制約を示す。現行実装の不足を新しい仕様として扱わない。確認日は2026-09-26。SDKやLINE側の仕様を変更に利用する際は、各節の公式資料も確認する。

画面の文言・詳細は[画面設計](../requirements/screens.md)と[画面詳細](../requirements/screens/README.md)、実装責務は[フロントエンド実装指針](./frontend.md)、認証契約は[API仕様](./api.md)を参照する。

## 1. 通常Web・LIFF・認証を分けて判断する

プロジェクト仕様として、通常Webは公開投稿を読む入口、LINEミニアプリは閲覧と利用者に紐づく操作の入口とする。LINEログイン済みであっても、通常Webに操作機能を開放しない。

| 画面・機能 | 通常Web | LIFF内・未ログイン | LIFF内・アプリ認証済み |
| --- | --- | --- | --- |
| `/`、`/concerns/:id` | 公開閲覧 | 公開閲覧 | 公開閲覧 |
| フィードの並び | 新着順 | 新着順 | 推薦順 |
| `/post`、`/quiz/today`、`/history` | LINEで開く案内 | ログイン案内 | プロフィール登録後に利用 |
| リアクション・既読 | 利用しない | リアクションはログイン案内。既読は記録しない | 利用できる。初期登録との関係は第7節を参照 |
| `/settings` | LINEで開く案内 | 画面を開ける | 画面を開ける。個人設定を保存できる |
| `/onboarding` | LINEで開く案内 | ログイン案内 | 未登録なら初期登録、登録済みなら `/` へ移動 |

現行実装では、`useRuntime()` の `state.status` / `mode` と、`useAuth()` の `status` / `user` を組み合わせる。

- 実行環境は `initializing` または `ready`。準備後の `mode` は `browser` / `liff`。
- 認証状態は `initializing` / `anonymous` / `authenticated`。認証失敗は `anonymous` と `error` で表し、`unavailable` という状態は現在の型にはない。
- LIFF IDがあるだけでLINE内とは判断しない。通常時の環境判定には初期化後の `liff.isInClient()` を使う。URL、画面幅、User-Agentだけで判定する処理を追加しない。
- `liff.isLoggedIn()` はLINE側の状態であり、バックエンドのCookieセッション確立とは別。画面の操作可否をSDKの値だけで決めない。
- `/admin/line-broadcast` は別の管理用ルートであり、この一般利用者向けの表の対象外。

参照実装: [RuntimeProvider](../../frontend/src/app/providers/RuntimeProvider.tsx)、[AuthContext](../../frontend/src/auth/auth-context.ts)、[ルートガード](../../frontend/src/app/router.tsx)、[ルート定義](../../frontend/src/app/routes.tsx)、[フィードの環境判定](../../frontend/src/features/feed/feedContext.ts)。

## 2. 起動と認証

### 起動・フォールバック

現行実装では `VITE_LINE_LIFF_ID` が設定され、開発用の強制LIFFモードでなければLIFFを初期化する。外部ブラウザでもこの初期化を通る。未設定なら通常Webとして始まる。

専用の起動画面は表示しない。フィード・クイズは初期化とCookieセッション確認中から表紙を表示し、開く操作後だけ待機中の文言を表示する。準備後は自動で開く。LIFF初期化中は下部ナビを操作不可にしてURLを維持する。クイズの表紙表示は利用許可を意味せず、API取得・本文表示には従来の認証とプロフィール確認を必要とする。詳細は[画面設計](../requirements/screens.md)を参照する。

初期化が失敗すると `browser` と `liffInitializationFailed: true` へ切り替わる。公開閲覧を続け、失敗案内とLINEで開き直す導線を表示する。投稿などの操作用URLを開いていた場合も、操作を実行せず通常Webと同じ案内を表示する。

### アプリのセッション

[AuthProvider](../../frontend/src/auth/AuthProvider.tsx)の通常時の処理は次のとおり。

1. `GET /api/v1/auth/session` でCookieセッションを復元する。
2. 未認証ならLIFFを初期化し、LINE側でログイン済みの場合は `getIDToken()` の値を `POST /api/v1/auth/line` へ渡す。
3. サーバーがトークンを検証し、HttpOnly Cookieを発行する。以後のAPI通信はCookieを使う。
4. 明示的なログイン操作では、LINE側が未ログインの場合に `liff.login()` へ進む。

[Hono RPCクライアント](../../frontend/src/lib/api.ts)の `credentials: 'include'` を維持する。各APIへIDトークンを独自添付したり、Cookie・トークンを `localStorage` へ保存したりしない。CORS・Cookie属性の変更はバックエンドの認証契約と一緒に検討する。画面のガードはサーバーの認証検証を代替しない。

## 3. URL・画面遷移・LINEへ戻る動作

LINE側の制約として、初期化は登録したエンドポイントURLと同じか、その配下のURLで行う。初期化が完了するまで、ルーターによるURL変更や `liff.*` パラメータの除去を行わない。初期化中のURLには認証情報が含まれることがあるため、URL全体をログ・解析サービスへ送らない。[公式: LIFF初期化時の注意事項](https://developers.line.biz/ja/reference/liff/#initializing-liff-app)

現行実装の遷移は以下のとおり。

- アプリ内の移動にはReact Routerを使う。起動元が `/quiz/today` や `/concerns/:id` なら、そのパスを処理し、無条件に `/` へ戻さない。
- LINEへ移るリンクは `useRuntime().liffUrl(path)` を使い、`https://liff.line.me/{LIFF ID}{path}` を生成する。ID未設定では `null` になり、開くリンクを表示しない。
- LINEで開く案内が引き継ぐのは `location.pathname`。ログインの戻り先も `origin + pathname` で、検索パラメータ・ハッシュの保持は実装していない。新しいクエリ依存の導線を作る場合は、往復時の復元も設計する。
- 初期登録は `/onboarding` 自身を `ProtectedRoute` で包まない。未登録ユーザーが同じ画面へ戻り続けるため。登録成功後はセッションを再取得して `/` へ移る。元の操作画面への復帰は現在行わない。
- 履歴の利用不可画面の「LINEへ戻る」は `closeLineWindow()` を呼ぶ。現在のラッパーは初期化済みかつLINE内の場合だけ `liff.closeWindow()` を呼び、閉じられない・例外の場合はLIFFの `/`、ID未設定なら通常の `/` へ移動する。

アプリ内の「戻る」とLINEのウィンドウを「閉じる」は別の操作として扱う。外部ブラウザでの `liff.closeWindow()` は動作保証がない。[公式: liff.closeWindow](https://developers.line.biz/ja/reference/liff/#close-window)

参照実装: [LIFFクライアント](../../frontend/src/infrastructure/liff/client.ts)、[ログインの戻り先](../../frontend/src/auth/liff.ts)、[初期登録](../../frontend/src/features/onboarding/useOnboardingNotebook.ts)、[履歴](../../frontend/src/features/history/HistoryPage.tsx)。

## 4. LINE内の表示領域と入力操作

プロジェクト仕様はスマートフォン向け1カラムで、360px幅を基本の確認対象とする。LINE側のヘッダーや端末の安全領域を含めて確認し、ブラウザのスクリーンショットだけで操作可能と判断しない。

- 現行の [AppShell](../../frontend/src/app/AppShell.module.css) は高さ `100svh` の2行Grid。本文領域が縦スクロールし、その下に5項目のナビを置く。ナビを本文へ重ねる固定配置に変える場合は、入力欄・主要操作が隠れないことを確認する。
- [index.html](../../frontend/index.html) のviewportに `viewport-fit=cover` を指定し、上部余白と下部ナビに `env(safe-area-inset-top)` / `env(safe-area-inset-bottom, 0px)` を使用する。下部ナビは通常の12pxに端末の下側安全領域を加算し、ホームインジケーターと操作を離す。安全領域が0なら12pxを維持する。[WebKit公式の方式](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)に従うが、LINE内のWebViewが返す値は実機で確認し、ノッチ・ホームインジケーター・横向きで重なりがないことを実測する。
- LINE公式は縦向きと横向きで異なるセーフエリアを案内している。既存の余白へ固定値を無条件に加算せず、表示領域との重複を確認する。[公式: LINEミニアプリのセーフエリア](https://developers.line.biz/ja/docs/line-mini-app/design/landscape/)
- ソフトウェアキーボードを開閉し、本文入力・初期登録・設定の入力欄と送信操作へ到達できることを確認する。画面高が不足した場合は、文字を縮めず本文領域の縦スクロールを許容する。
- 横めくりと縦スクロールを両立させる。[useNotebookSwipe](../../frontend/src/shared/hooks/useNotebookSwipe.ts) は縦方向のジェスチャーをめくりにせず、スワイプ後のリンク誤作動を防ぐ。入力欄では左右キーをめくりに使わない。
- クイズのしおりはタップで選び、差し込むアニメーションで結果を示す。LINEの下方向スワイプによる最小化と競合しないよう、タッチ・ペンでのドラッグ配置は行わない。移動や `pointercancel` で中断した操作は回答に反映せず、マウスのドラッグとキーボード選択は維持する。配置済みのしおりを押すと選び直せる。[公式: LIFFブラウザの最小化](https://developers.line.biz/ja/docs/liff/minimizing-liff-browser/)
- 「大きく表示」、OS・ブラウザの拡大、`prefers-reduced-motion`、キーボード操作を確認する。文字サイズ・スクロールの詳細は[デザイン指針](../requirements/design-guidelines.md)に従う。
- クレヨン輪郭のSVGフィルタは [CrayonFilters](../../frontend/src/shared/components/CrayonFilters.tsx) を同一DOMに配置し、`url(#crayon-edge)` などで参照する。現行コードはiOSでの描画互換性を理由にこの構成を採用している。外部SVG・data URIへの移動は実機で検証してから行う。

## 5. 中断・再表示とデータの保持

LINE側では利用履歴から開き直した際に、状態を保持した再開と、URLからの再読み込みの両方が起こり得る。常に初回マウントする、または常にReactの状態が残る、と仮定しない。[公式: LIFFの概要・最近使用したサービス](https://developers.line.biz/ja/docs/liff/overview/)

現行実装の保持範囲は次のとおり。

- 投稿本文は [usePostDraft](../../frontend/src/features/post/usePostDraft.ts) のメモリ内状態。送信失敗時の保持と、画面離脱・再読み込み後の復元は別であり、後者は実装していない。
- 文字サイズなどの表示設定は [DisplaySettingsProvider](../../frontend/src/app/providers/DisplaySettingsProvider.tsx) のメモリ内状態。表示言語の保存は [SettingsPage](../../frontend/src/features/settings/SettingsPage.tsx) のAPI処理が担当する。すべての設定が端末に永続保存されるとは扱わない。
- 詳細表示時の既読は [useConcernViewOnDisplay](../../frontend/src/features/concern-detail/useConcernViewOnDisplay.ts) がLIFF内かつアプリ認証済みの場合だけ記録する。Hook内のSetによる重複抑止は再マウントをまたぐ保証ではない。

編集時は、バックグラウンドからの復帰、セッション切れ、通信切断後の再操作を確認する。投稿・回答の自動再送を追加して二重送信を起こさない。下書きの永続化を追加する場合は、本文の保存場所・削除時期・アカウント切り替え時の扱いも仕様化する。

## 6. 開発モードと実機確認の切り分け

設定方法は [frontend README](../../frontend/README.md) と[開発・運用方針](./development.md)を参照する。ローカル設定変更後は開発サーバーを再起動する。

| 確認対象 | フロントエンドの設定・入口 | 確認できる範囲 |
| --- | --- | --- |
| 通常Web | `VITE_DEV_LIFF_MODE=false`、`VITE_DEV_AUTH_MODE` を空にし、LIFF ID未設定で開く | 公開閲覧、操作画面のLINE案内、ID未設定時の表示 |
| ローカルのログイン済み画面 | `VITE_DEV_LIFF_MODE=true`、`VITE_DEV_AUTH_MODE=backend`、`VITE_DEV_USER=demo-a`〜`demo-c` | ローカルAPI・D1とCookieセッションを使った画面操作 |
| 実際のLIFF | 開発用モードを外し、有効な `VITE_LINE_LIFF_ID` と登録したエンドポイントを使用してLINEから開く | 初期化、認証往復、LINE内の表示・閉じる動作 |

開発用フラグは `import.meta.env.DEV` の場合だけ有効。強制LIFFモードはRuntimeProviderのSDK初期化を省略するだけで、LINEアプリのWebView・認可画面・ウィンドウ操作を再現しない。Cookieセッションが残っていると未ログイン確認にならないため、認証状態も確認する。

## 7. 既知の差分・未実装を混同しない

以下は確認時点の注意点であり、この文書追加で実装を変更したものではない。

- 実装指針はLIFF SDKを `infrastructure/liff/` に閉じ込める方針だが、現在は `auth/liff.ts` にも初期化・認証処理がある。RuntimeProviderとAuthProviderは別々のラッパーを利用し、初期化Promiseも共有していない。共通化済みと仮定せず、認証変更では両方を確認する。
- [起動仕様](../requirements/screens/entry.md)はリアクション前にも初期登録を求めるが、ルートガードのプロフィール確認は `/post`・`/quiz/today`・`/history` が対象。公開画面内のリアクションを同じガードが保護するわけではない。関連操作を編集する際に、画面側の分岐と仕様を照合する。
- プロダクト要件の任意属性と、初期登録仕様の必須入力には記述差がある。プロフィールの入力条件を変更する際は、[初期登録仕様](../requirements/screens/onboarding.md)・[API仕様](./api.md)・サーバー実装を確認し、既存のガードを見た目の都合で外さない。
- [PostPage](../../frontend/src/features/post/PostPage.tsx)の音声入力は文字起こしAPIへ接続している。権限拒否・非対応・中断時は手入力へ戻れる。ローカルの疎通だけでLINE実機のマイク利用を保証せず、iOS/Androidで権限・バックグラウンド復帰も確認する。SettingsPageの読み上げは引き続き準備中で無効化されている。
- LINE Developers Consoleの実設定、iOS/AndroidのLINE実機動作は、この文書作成時には確認していない。対応OS・LINEバージョンの一律保証はしない。

## 8. 編集後の確認項目

変更に関係する項目を選び、結果と未確認の環境を作業報告へ残す。

- [ ] 通常Webで `/` と詳細を閲覧でき、操作用パスと設定はLINE案内になる。
- [ ] LIFF初期化中・失敗・ID未設定を区別し、公開閲覧へのフォールバックが働く。
- [ ] 未ログイン・ログイン済み・プロフィール未登録で導線が分かれ、登録へのループがない。
- [ ] フィード以外のURLから起動し、ログイン往復・再読み込み後も意図した画面を扱える。
- [ ] 360px幅・短い画面高・横向き・文字拡大・キーボード開閉でも主要操作へ到達できる。
- [ ] iOS/AndroidのLINEで安全領域、紙の描画、横めくりと縦スクロール、閉じる操作を確認する。
- [ ] 中断からの復帰、認証・API失敗、再試行で入力や選択が不必要に消えず、重複送信しない。
- [ ] `pnpm --filter frontend lint` と `pnpm --filter frontend build` が成功する。API契約も変えた場合はバックエンドの型検査・関連テストも行う。

ドキュメントのみの変更では、参照リンク・コードとの整合性・`git diff --check` を確認する。開発モードやPCブラウザでの確認を、LINE実機での確認として報告しない。
