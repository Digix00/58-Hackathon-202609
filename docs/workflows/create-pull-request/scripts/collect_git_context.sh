#!/usr/bin/env bash
set -euo pipefail

echo "== ブランチ =="
git branch --show-current

echo
echo "== upstream =="
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "(upstream なし)"

echo
echo "== ステータス =="
git status --short --branch

echo
echo "== staged の diff stat =="
git diff --cached --stat

echo
echo "== unstaged の diff stat =="
git diff --stat

echo
echo "== 未追跡ファイル =="
git ls-files --others --exclude-standard

echo
echo "== 最近のコミット =="
git log --oneline --decorate -5 2>/dev/null || echo "(コミットなし)"
