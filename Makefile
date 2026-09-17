.PHONY: help install db-migrate dev backend frontend

help:
	@echo "make dev         - 依存インストール + ローカルD1へのマイグレーション適用 + backend/frontend同時起動"
	@echo "make install     - 依存関係のインストール"
	@echo "make db-migrate  - ローカルD1にマイグレーションを適用"
	@echo "make backend     - backendのみ起動 (http://localhost:8787)"
	@echo "make frontend    - frontendのみ起動 (http://localhost:5173)"

install:
	pnpm install

# Cloudflare D1はwrangler devが内部(miniflare)でSQLiteとして扱うため、
# 常駐する「DBサーバー」は存在しない。ローカルDBを使える状態にする手順は
# マイグレーション適用のみで完結する。
db-migrate: install
	pnpm --filter backend db:migrate:local

dev: db-migrate
	pnpm dev

backend: install
	pnpm --filter backend dev

frontend: install
	pnpm --filter frontend dev
