---
name: create-pull-request
description: 現在の git の作業ツリーを確認し、何を変更したのかを説明し、適切な粒度でコミットを分け、ブランチを push し、gh でプルリクエストを作成する。既存ブランチに対して、現在の差分確認、コミット境界の判断、コミットメッセージ作成、git push の実行、PR テンプレート未定義の状態での pull request 作成までを一通り任せたいときに使う。
---

ワークフローの定義は `docs/workflows/create-pull-request/README.md` が正典です。

まず以下を実行してワークフロー定義を読み込み、その指示に従ってください。

```bash
cat docs/workflows/create-pull-request/README.md
```
