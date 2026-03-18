.PHONY: setup dev build clean lint format check test

## Setup — install all dependencies (run once after clone)
setup:
	mise install
	npm install

## Dev — run the app with hot reload
dev:
	npm run tauri dev

## Build — create a distributable binary
build:
	npm run tauri build

## Test — run Rust unit tests
test:
	cd desktop && cargo test

## Lint — check both frontend and backend
lint:
	npm run lint
	cd desktop && cargo clippy -- -D warnings

## Format — auto-format all code
format:
	npm run format
	cd desktop && cargo fmt

## Check — verify everything compiles, lints, and is formatted
check: lint
	npm run format:check
	cd desktop && cargo fmt --check
	npm run build

## Clean — remove build artifacts
clean:
	rm -rf ui/dist
	cd desktop && cargo clean
