.PHONY: help install db-migrate dev backend frontend format-frontend format-check-frontend lint-frontend lint-backend build-frontend build-backend test-backend check-frontend check-backend check dev-vars

help:
	@echo "make dev         - 依存インストール + ローカルD1へのマイグレーション適用 + backend/frontend同時起動"
	@echo "make install     - 依存関係のインストール"
	@echo "make db-migrate  - ローカルD1にマイグレーションを適用"
	@echo "make backend     - backendのみ起動 (http://localhost:8787)"
	@echo "make frontend    - frontendのみ起動 (http://localhost:5173)"
	@echo "make format-frontend       - frontendのコードを整形"
	@echo "make format-check-frontend - frontendのコード整形を確認"
	@echo "make lint-frontend         - frontendをlint"
	@echo "make lint-backend          - backendをlint"
	@echo "make build-frontend        - frontendを型検査・ビルド"
	@echo "make build-backend         - backendを型検査・ビルド"
	@echo "make test-backend          - backendのテスト"
	@echo "make check-frontend        - frontendのCI相当チェック"
	@echo "make check-backend         - backendのCI相当チェック"
	@echo "make check                 - frontend/backendのCI相当チェック"

install:
	pnpm install

# Cloudflare D1はwrangler devが内部(miniflare)でSQLiteとして扱うため、
# 常駐する「DBサーバー」は存在しない。ローカルDBを使える状態にする手順は
# マイグレーション適用のみで完結する。
db-migrate: install
	pnpm --filter backend db:migrate:local

# ローカル開発用のCORS設定がない場合だけサンプルから作成する。
# 既存の.dev.varsは上書きせず、開発者固有の設定を保持する。
dev-vars:
	@test -f backend/.dev.vars || cp backend/.dev.vars.example backend/.dev.vars

dev: db-migrate dev-vars
	pnpm dev

backend: install dev-vars
	pnpm --filter backend dev

frontend: install
	pnpm --filter frontend dev

format-frontend:
	pnpm --filter frontend format

format-check-frontend:
	pnpm --filter frontend format:check

lint-frontend:
	pnpm --filter frontend lint

lint-backend:
	pnpm --filter backend lint

build-frontend:
	pnpm --filter frontend build

build-backend:
	pnpm --filter backend build

test-backend:
	pnpm --filter backend test

check-frontend: format-check-frontend lint-frontend build-frontend

check-backend: lint-backend build-backend test-backend

check: check-frontend check-backend
