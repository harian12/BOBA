.PHONY: help install dev dev-desktop dev-server build build-desktop build-server test clean deploy-server pm2-start pm2-stop pm2-restart pm2-logs

# Default target
help:
	@echo "BOBA Management Makefile"
	@echo "----------------------------------------"
	@echo "Available commands:"
	@echo "  make install        Install all dependencies for desktop and server"
	@echo "  make dev-desktop    Run Nuxt 4 + Tauri desktop app in dev mode"
	@echo "  make dev-server     Run Hono sync server in dev mode"
	@echo "  make build          Build both desktop and server for production"
	@echo "  make build-desktop  Generate Nuxt SPA and build Tauri desktop app"
	@echo "  make build-server   Bundle server TypeScript code with esbuild"
	@echo "  make test           Run tests for server"
	@echo "  make clean          Clean build artifacts and caches"
	@echo "  make deploy-server  Build and restart server with PM2"
	@echo "  make pm2-start      Start server with PM2"
	@echo "  make pm2-stop       Stop server in PM2"
	@echo "  make pm2-restart    Restart server in PM2"
	@echo "  make pm2-logs       View realtime logs from PM2"

# 1. Dependency Installation
install:
	@echo "Installing dependencies..."
	cd apps/server && npm install
	cd apps/desktop && npm install

# 2. Development
dev-desktop:
	cd apps/desktop && npm run tauri dev

dev-server:
	cd apps/server && npm run dev

dev:
	@echo "Starting desktop in dev mode..."
	cd apps/desktop && npm run tauri dev

# 3. Production Builds
build-server:
	@echo "Ensuring server dependencies and building bundle (esbuild)..."
	cd apps/server && (test -d node_modules || npm install --include=dev) && npm run build

build-desktop:
	@echo "Building desktop frontend & Tauri app..."
	cd apps/desktop && npm run generate && npm run tauri build

build: build-server build-desktop
	@echo "Build completed for all services!"

# 4. Testing
test:
	cd apps/server && npm run test

# 5. Clean Artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf apps/desktop/.output
	rm -rf apps/desktop/.nuxt
	rm -rf apps/desktop/src-tauri/target
	rm -rf apps/server/dist
	rm -rf apps/server/logs/*.log

# 6. Server & PM2 Operations
pm2-start: build-server
	pm2 start ecosystem.config.cjs

pm2-stop:
	pm2 stop boba-sync-server || true

pm2-restart: build-server
	pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

pm2-logs:
	pm2 logs boba-sync-server

deploy-server: build-server
	@echo "Deploying and restarting server in PM2..."
	pm2 delete boba-sync-server || true
	pm2 start ecosystem.config.cjs
	pm2 save
