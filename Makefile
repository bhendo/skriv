.PHONY: setup dev build clean \
	lint lint-ui lint-desktop \
	format format-ui format-desktop \
	check check-ui check-desktop \
	test test-ui test-desktop

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

## Test
test: test-ui test-desktop

test-ui:
	npm test

test-desktop:
	cd src-tauri && cargo test

## Lint
lint: lint-ui lint-desktop

lint-ui:
	npm run lint

lint-desktop:
	cd src-tauri && cargo clippy -- -D warnings

## Format — auto-format all code
format: format-ui format-desktop

format-ui:
	npm run format

format-desktop:
	cd src-tauri && cargo fmt

## Check — verify formatting, linting, and tests
check: check-ui check-desktop

check-ui:
	npm run format:check
	npm run lint
	npm test

check-desktop:
	cd src-tauri && cargo fmt --check
	cd src-tauri && cargo clippy -- -D warnings
	cd src-tauri && cargo test

## Clean — remove build artifacts
clean:
	rm -rf ui/dist
	cd src-tauri && cargo clean
