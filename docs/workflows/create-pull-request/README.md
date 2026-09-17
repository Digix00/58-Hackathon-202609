# Git PR Flow

## 概要

git の操作に入る前に、まず現在のリポジトリ状態を確認する。変更内容を平易な言葉で要約し、適切な粒度でコミットを作成し、現在のブランチを push し、実際に反映した変更に沿った pull request を作成する。

## 呼び出し方法

| 環境 | コマンド |
|------|----------|
| Claude Code (CLI) | `/create-pull-request` |
| Codex | `$create-pull-request` |

## 手順

1. リポジトリルートで `bash docs/workflows/create-pull-request/scripts/collect_git_context.sh` を実行し、ブランチ、upstream、status、diff stat、最近のコミットをまとめて確認する。
2. 出力されたファイル一覧を読み、コミット境界の判断に必要なファイルだけ詳細 diff を確認する。
3. git の状態を変更する前に、今何が変わっているかを説明する。どのファイルを同じコミットに含めるべきか、その理由も示す。
4. **バックエンド変更が含まれる場合は、必要に応じてリポジトリルートで `make fmt` / `make generate-code` を実行する（詳細は後述）。**
5. ディレクトリ構成ではなく、振る舞いや意図に基づいてコミット単位を決める。原則として、1 つの意図につき 1 コミットを優先する。
6. その意図に属するファイルだけを stage し、具体的なメッセージで commit する。作業ツリーが空になるまで繰り返す。
7. 現在のブランチを upstream に push する。
8. 実際に作成したコミット内容をもとに、簡潔なタイトルと本文で `gh pr create` を実行する。

## リポジトリの確認

推測で進めず、まずコンテキストを集める。

- `bash docs/workflows/create-pull-request/scripts/collect_git_context.sh` を実行する。
- サマリーだけでは挙動が分からないファイルは `git diff -- <path>` を実行する。
- すでに stage 済みの変更がある場合は `git diff --cached -- <path>` も分けて確認する。
- 取りこぼしや混在を避けるため、各コミットの前に `git status --short` を再確認する。

差分がなければ、その旨を伝えて終了する。変更がない状態で空コミット、push、PR 作成はしない。

## バックエンド変更時の `make fmt` / `make generate-code`（リポジトリルートで実行）

バックエンドに変更がある場合、コミット前に以下を検討・実行する。

- **`make fmt`**: `backend/` 配下の Go ファイルに変更がある場合は原則実行する（リポジトリルートで実行）。
- **`make generate-code`**: Swagger 注釈や API 定義に影響しそうな変更（例: `backend/cmd/server`、`backend/internal/handler`、`backend/internal/usecase`、`backend/internal/domain`、`backend/docs` など）が含まれる場合は実行する（リポジトリルートで実行）。  
  生成物の差分が出たら、関連するコミットに含める。

迷った場合は実行を優先し、生成物の差分がないことを確認する。

## コミット境界の決め方

コミットは意図で分ける。適切な境界の例は以下。

- ユーザーに見える機能追加
- バグ修正
- 振る舞いを変えないリファクタ
- テストだけの更新
- ドキュメントや設定だけの変更

以下の分け方は避ける。

- 分離できるのに、リファクタと機能追加を同じコミットに混ぜる
- その変更に必須の生成物でないのに、生成ファイルと無関係なソース変更をまとめる
- 単体で意味を持たない極小コミットを大量に作る
- どのように分けるかを説明せず、変更ファイルを一度にすべて stage する

境界が曖昧なときは、不自然な micro-commit を量産するより、意図が明確な少数のコミットを優先する。

## コミットメッセージ

**接頭辞は英語、説明は日本語**で書く。形式は `<type>: <日本語の説明>` とする。

使用する接頭辞:

| 接頭辞 | 用途 |
|--------|------|
| `feat:` | 新機能の追加 |
| `fix:` | バグ修正 |
| `refactor:` | 振る舞いを変えないリファクタ |
| `docs:` | ドキュメントのみの変更 |
| `chore:` | ビルド設定・依存関係など雑務 |
| `test:` | テストのみの変更 |

例:

- `feat: オンボーディングフォームのバリデーションを追加`
- `fix: 設定読み込み時の API_BASE_URL の nil を処理`
- `refactor: フィードセルのレイアウト定数を抽出`

`update`、`fix stuff`、`WIP` のような曖昧なメッセージは使わない。説明を英語で書かない。

## ブランチ戦略

作業は必ずフィーチャーブランチで行う。**main ブランチへの直接 push は絶対に行わない。**

### ブランチの確認とチェックアウト

コミットに進む前に現在のブランチを確認する。

```bash
git branch --show-current
```

- **main 以外のブランチにいる場合**: そのまま作業を続ける。
- **main ブランチにいる場合**: 必ず新しいブランチを作成してからコミットする。

```bash
git checkout -b <type>/<description>
```

### ブランチ名の形式

`<type>/<description>` の形式を使う。`description` は kebab-case の英語とする。

| type | 用途 |
|------|------|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `refactor` | リファクタ |
| `docs` | ドキュメントのみの変更 |
| `chore` | ビルド設定・依存関係など雑務 |

例:
- `feat/user-authentication`
- `fix/api-base-url-xcconfig`
- `docs/update-review-guidelines`

### push のルール

push は**現在作業中のフィーチャーブランチのみ**を対象とする。main ブランチには絶対に push しない。

```bash
# 正しい例: フィーチャーブランチへの push
git push -u origin "$(git branch --show-current)"

# 禁止: main への直接 push は行わない
```

## Git コマンドの実行

各コミットでは以下の流れを使う。

```bash
git add <paths...>
git commit -m "type: 簡潔な日本語の説明"
```

最後のコミット後は以下を実行する。

```bash
git push
```

ブランチに upstream がなくて `git push` に失敗した場合は、以下を使う。

```bash
git push -u origin "$(git branch --show-current)"
```

## Pull Request の作成

ブランチが push されていることを確認してから `gh pr create` を使う。

- Base branch: リポジトリの文脈から分かるならそれを使う。曖昧なら GitHub が返すデフォルトブランチを優先する。
- Title: ブランチ名ではなく、実際に反映した変更の結果を表す。
- Body: [`references/pr_body_template.md`](references/pr_body_template.md) と [`REVIEW.md`](../../../REVIEW.md) の「PR説明欄の更新」に合わせて書く。Mermaid による図解が必要な変更だけ追加し、それ以外は省略してよい。

例:

```bash
gh pr create --title "feat: initialize iOS app scaffold" --body "$(cat /tmp/pr-body.txt)"
```

`gh` が「そのブランチの PR は既に存在する」と返した場合は、重複作成せず、その結果を報告する。

## 結果の報告

完了後は以下を報告する。

- 作成したコミット一覧
- push したブランチ名
- PR の URL
- 前提や判断事項。特にコミット分割や base branch の選定理由

## リソース

### scripts/

- `scripts/collect_git_context.sh`: コミット境界を決める前に、ブランチ情報、status、staged と unstaged の diff stat、未追跡ファイル、最近のコミットをまとめて取得する。

### references/

- [`references/pr_body_template.md`](references/pr_body_template.md): [`REVIEW.md`](../../../REVIEW.md) の PR 説明フォーマットに合わせた本文テンプレート。
