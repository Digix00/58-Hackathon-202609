.PHONY: help install db-migrate db-seed-local dev backend frontend format-frontend format-check-frontend format-backend format-check-backend lint-frontend lint-backend build-frontend build-backend test-backend check-frontend check-backend check dev-vars frontend-env

help:
	@echo "make dev         - 依存インストール + ローカルD1へのマイグレーション・開発用データ適用 + backend/frontend同時起動"
	@echo "make install     - 依存関係のインストール"
	@echo "make db-migrate  - ローカルD1にマイグレーションを適用"
	@echo "make db-seed-local - ローカルD1に開発用データを投入"
	@echo "make frontend-env - frontend/.env.localがなければサンプルから作成"
	@echo "make backend     - backendのみ起動 (http://localhost:8787)"
	@echo "make frontend    - frontendのみ起動 (http://localhost:5173)"
	@echo "make format-frontend       - frontendのコードを整形"
	@echo "make format-check-frontend - frontendのコード整形を確認"
	@echo "make format-backend        - backendのコードを整形"
	@echo "make format-check-backend  - backendのコード整形を確認"
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

# フロントエンドのローカル設定がない場合だけサンプルから作成する。
# 既存の.env.localは上書きせず、LINE認証などの開発者固有の設定を保持する。
frontend-env:
	@test -f frontend/.env.local || cp frontend/.env.example frontend/.env.local

db-seed-local: db-migrate
	pnpm --filter backend db:seed:local

dev: db-migrate dev-vars frontend-env db-seed-local
	pnpm dev

backend: install dev-vars
	pnpm --filter backend dev

frontend: install frontend-env
	pnpm --filter frontend dev

format-frontend:
	pnpm --filter frontend format

format-check-frontend:
	pnpm --filter frontend format:check

format-backend:
	pnpm --filter backend format

format-check-backend:
	pnpm --filter backend format:check

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

check-backend: format-check-backend lint-backend build-backend test-backend

check: check-frontend check-backend
