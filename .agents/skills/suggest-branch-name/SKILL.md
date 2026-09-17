---
name: suggest-branch-name
description: 現在の git の変更内容を確認し、変更の意図を分析して最も適切なブランチ名を決定する。main ブランチで作業している場合は、そのブランチ名で自動的に新しいブランチへ切り替える。ステージングされていればステージングしたものを、そうでなければワーキングツリーの変更を分析する。
---

ワークフローの定義は `docs/workflows/suggest-branch-name/README.md` が正典です。

まず以下を実行してワークフロー定義を読み込み、その指示に従ってください。

```bash
cat docs/workflows/suggest-branch-name/README.md
```
