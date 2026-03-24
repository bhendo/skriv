.PHONY: setup dev build clean \
	lint lint-ui lint-tauri \
	format format-ui format-tauri \
	check check-ui check-tauri \
	test test-ui test-tauri test-e2e

MISE_EXEC := mise exec --
RUSTC_WRAPPER := $(abspath scripts/rustc-wrapper.sh)

export RUSTC_WRAPPER

## Setup — install all dependencies (run once after clone)
setup:
	mise install
	$(MISE_EXEC) pnpm install

## Dev — run the app with hot reload
dev:
	$(MISE_EXEC) pnpm tauri dev

## Build — create a distributable binary
build:
	$(MISE_EXEC) pnpm tauri build

## Test
test: test-ui test-tauri test-e2e

test-ui:
	$(MISE_EXEC) pnpm test

test-tauri:
	cd src-tauri && $(MISE_EXEC) cargo test

test-e2e:
	$(MISE_EXEC) pnpm test:e2e

## Lint
lint: lint-ui lint-tauri

lint-ui:
	$(MISE_EXEC) pnpm lint

lint-tauri:
	cd src-tauri && $(MISE_EXEC) cargo clippy -- -D warnings

## Format — auto-format all code
format: format-ui format-tauri

format-ui:
	$(MISE_EXEC) pnpm format

format-tauri:
	cd src-tauri && $(MISE_EXEC) cargo fmt

## Check — verify formatting, linting, and tests
check: check-ui check-tauri

check-ui:
	$(MISE_EXEC) pnpm format:check
	$(MISE_EXEC) pnpm lint
	$(MISE_EXEC) pnpm tsc --noEmit
	$(MISE_EXEC) pnpm test

check-tauri:
	cd src-tauri && $(MISE_EXEC) cargo fmt --check
	cd src-tauri && $(MISE_EXEC) cargo clippy -- -D warnings
	cd src-tauri && $(MISE_EXEC) cargo test

## Clean — remove build artifacts
clean:
	rm -rf ui/dist
	cd src-tauri && cargo clean
