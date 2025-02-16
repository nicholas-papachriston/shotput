.PHONY: *

SHELL := /bin/bash

build: install
	tsc
	source env.sh && bun build --compile src/index.ts --outfile ./dist/shotput

dev: install
	source env.sh && bun run src/index.ts

install:
	source env.sh && bun install

install-clean:
	rm -rf node_modules bun.lockb
	bun install

fix: install
	bunx biome check --write .

npm:
	bun run build
	npm login
	npm publish

test:
	bun test src/*
