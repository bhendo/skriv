.PHONY: setup dev build clean \
	lint lint-ui lint-tauri \
	format format-ui format-tauri \
	check check-ui check-tauri \
	test test-ui test-tauri

## Setup — install all dependencies (run once after clone)
setup:
	mise install
	pnpm install

## Dev — run the app with hot reload
dev:
	pnpm tauri dev

## Build — create a distributable binary
build:
	pnpm tauri build

## Test
test: test-ui test-tauri

test-ui:
	pnpm test

test-tauri:
	cd src-tauri && cargo test

## Lint
lint: lint-ui lint-tauri

lint-ui:
	pnpm lint

lint-tauri:
	cd src-tauri && cargo clippy -- -D warnings

## Format — auto-format all code
format: format-ui format-tauri

format-ui:
	pnpm format

format-tauri:
	cd src-tauri && cargo fmt

## Check — verify formatting, linting, and tests
check: check-ui check-tauri

check-ui:
	pnpm format:check
	pnpm lint
	pnpm tsc --noEmit
	pnpm test

check-tauri:
	cd src-tauri && cargo fmt --check
	cd src-tauri && cargo clippy -- -D warnings
	cd src-tauri && cargo test

## Clean — remove build artifacts
clean:
	rm -rf ui/dist
	cd src-tauri && cargo clean
