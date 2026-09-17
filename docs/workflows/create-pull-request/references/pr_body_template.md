# PR 本文テンプレート

[`.github/PULL_REQUEST_TEMPLATE.md`](../../../../.github/PULL_REQUEST_TEMPLATE.md) の各項目を埋めるための補足。`gh pr create` の `--body` にはこのテンプレートを埋めたものを渡す。

## 概要

このPRで何をするか、なぜ必要かを簡潔に。

## 変更内容

- 実際に反映した変更を箇条書きで列挙する。

## レビュワーに確認して欲しいこと

- 判断が分かれそうな点や、前提を確認してほしい点があれば書く。なければ `該当なし` と明記する。

## 動作確認

- [ ] backend: `pnpm --filter backend lint` / `pnpm --filter backend build` / `pnpm --filter backend test`
- [ ] frontend: `pnpm --filter frontend lint` / `pnpm --filter frontend build`

実施していない項目は未チェックのまま残し、必要なら理由を補足する。バックエンド・フロントエンドどちらにも影響がない変更では、その旨を明記して対象外にしてよい。

## 見た目の修正

フロントエンド（見た目）に関する修正を行った場合は、スクリーンショットを貼る。該当しない場合は `該当なし` と明記する。

## その他

- プライバシー・セキュリティ・後方互換性・パフォーマンスへの影響など、補足すべき事項があれば書く。なければ `該当なし` と明記する。
