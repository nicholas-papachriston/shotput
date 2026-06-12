# shotput

## Project Overview

Shotput (`@agent_oxide/shotput`) is a zero-dependency programmatic templating library for Bun, designed for Gen AI applications — system prompts, personas, context engineering, and multi-source prompt assembly. It resolves templates from files, directories, globs, HTTP, S3/R2, functions, Anthropic Skills, SQLite, Redis, and custom source plugins, with optional streaming for large content, security validation, token-aware budgeting, and lifecycle hooks.

**Tech stack:** TypeScript (strict), Bun runtime and test runner, Biome for lint/format. Published to npm as a bundled `dist/` package with no runtime dependencies. Optional native Jinja2 syntax mode is validated against CPython Jinja2 via a Python conformance harness.

**Primary API:** `shotput()` returns a fluent builder; chain config setters (`.templateDir()`, `.context()`, `.allowedBasePaths()`, etc.), then call `.run()`, `.stream()`, `.streamSegments()`, or `.build()` for a reusable `ShotputProgram`. Use `compileShotputTemplate()` to pre-compile templates for repeated renders.

## Repository Structure

```
shotput/
├── src/                    # Library source
│   ├── index.ts            # Public entry: shotput(), compileShotputTemplate()
│   ├── api/                # Re-exported public types and builder surface
│   ├── builder/            # ShotputBuilder, ShotputProgram, base merge logic
│   ├── config.ts           # ShotputConfig interface and createConfig() (env + defaults)
│   ├── language/
│   │   ├── shotput/        # Native syntax: {{#if}}, {{#each}}, variables, rules
│   │   └── jinja/          # Native Jinja2 engine (if/for/set/with/macro/include/filters)
│   ├── runtime/            # Interpolation engine, streaming, apply pipeline
│   ├── sources/            # Built-in and plugin source handlers (file, http, s3, subagent, playbook)
│   ├── db/                 # Redis and SQLite placeholder resolution
│   ├── support/            # Format helpers (markdown, jsonl, xml), sections, stream utils
│   ├── worker/             # Tokenizer worker for async token counting
│   └── *.ts                # Top-level modules: security, hooks, s3, http, glob, tokens, etc.
├── test/
│   ├── unit/               # Unit tests per module (28 files)
│   ├── integration/        # End-to-end shotput() workflows
│   └── conformance/        # Jinja2 parity vs CPython (fixtures, jinja2_render.py, expected.json)
├── examples/
│   ├── basic/              # Core feature demos (01–23)
│   ├── advanced/           # S3, streaming, security, DB, parallel, nested templates
│   ├── benchmark/          # Comparison vs EJS, Handlebars, Mustache, Nunjucks, Binja, Jinja2
│   ├── data/               # Shared fixture data for examples
│   └── index.ts            # Runs all examples sequentially
├── docs/
│   ├── usage.md            # Template syntax, variables, S3/R2, parallel processing
│   ├── api.md              # Builder setters, types, format utilities
│   ├── environment-variables.md
│   ├── security.md
│   └── llm-template-guide.txt
├── build.ts                # Bun.build entry → dist/index.js
├── dts-bundle-generator.config.json  # Single dist/index.d.ts
├── biome.json              # Lint and format config
├── tsconfig.json           # Strict TypeScript (noEmit; declarations via dts-bundle-generator)
├── bunfig.toml             # Test coverage enabled by default
├── env.example             # Sample .env for local development
├── llms.txt                # LLM-facing template syntax index
├── package.json            # Scripts and publish config (files: ["dist"])
└── README.md               # User-facing overview and quick start
```

## Build Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run build` | Bundle `src/index.ts` → `dist/index.js` + generate `dist/index.d.ts` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome check |
| `bun run fix` | Biome check with auto-fix (`--unsafe`) |
| `bun run examples` | Run all examples (`examples/index.ts`) |
| `bun run benchmark` | Run benchmark suite (`examples/benchmark/run-all.ts`) |
| `bun run conformance:generate` | Regenerate CPython Jinja2 snapshots (`test/conformance/expected.json`) |

**Run locally (from repo root):**

```bash
bun install
bun run build
bun test
```

**Run a single example:**

```bash
bun run examples/basic/01-simple-file.ts
```

## Code Conventions

- **Language:** TypeScript with `strict: true`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`.
- **Formatting:** Tabs for indentation, double quotes for strings (Biome).
- **Imports:** Top-level only; organize imports enabled in Biome.
- **Modules:** ESM (`"type": "module"`); public API exported from `src/index.ts` and `src/api/`.
- **Patterns:**
  - Fluent builder (`ShotputBuilder`) with immutable overrides merged via `_merge()` / `with()`.
  - `ShotputProgram` for pre-built or compiled templates (`compileShotputTemplate()`).
  - Source plugin architecture (`SourcePlugin`, `registerBuiltins`, custom handlers).
  - Config resolved from env vars + programmatic overrides in `createConfig()`.
  - Lifecycle hooks: `preResolve`, `postResolveSource`, `postAssembly`, `preOutput`.
  - Use exhaustive `never` checks in switch default branches over discriminated unions.
- **Bun APIs:** `Bun.build`, `Bun.test`, `Bun.$`, `Bun.write`, native S3/HTTP where applicable.
- **Biome scope:** `src`, `test`, `examples`, `build.ts`, root `*.json`; ignores `dist`, `github`, `test/conformance/expected.json`.

## Testing

| Command | Description |
|---------|-------------|
| `bun test` | All tests; cleans `test-temp-*` dirs afterward |
| `bun run test:unit` | `test/unit/` only |
| `bun run test:integration` | `test/integration/` only |
| `bun run test:watch` | Watch mode |
| `bun run test:coverage` | Coverage report (`bunfig.toml` enables coverage by default) |
| `bun run test:conformance` | Strict Jinja2 parity (`SHOTPUT_CONFORMANCE_STRICT=1`) |

Tests use `bun:test` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`). Integration tests create ephemeral `test-temp-*` directories. Fuzz tests use `fast-check` in `test/unit/fuzz.test.ts`.

**Conformance prerequisites:** `uv`, Python 3, and `jinja2` (`uv add jinja2` or `pip install jinja2`). Generate expected output with `bun run conformance:generate` before running strict conformance locally.

**CI** (`.github/workflows/ci.yml`): `bun install --frozen-lockfile` → lint → typecheck → build → `bun test` on push to `main`/`develop`.

## Important Files

- `src/index.ts` — public entry: `shotput()`, `compileShotputTemplate()`, re-exports from `./api`
- `src/config.ts` — `ShotputConfig` and env-driven `createConfig()`
- `src/builder/builder.ts` — fluent `ShotputBuilder` with chainable setters
- `src/builder/program.ts` — immutable `ShotputProgram` for compiled/reusable templates
- `src/sources/registerBuiltins.ts` — registers built-in source handlers
- `src/security.ts` — path/domain/function allowlist validation
- `build.ts` — production bundle via `Bun.build` (minified, external sourcemaps)
- `docs/usage.md` — template syntax and source placeholder reference
- `docs/api.md` — builder API and type reference
- `docs/security.md` — security model and hardening guidance
- `llms.txt` — LLM-facing index linking to `docs/llm-template-guide.txt`

## Environment and Configuration

Configuration can be set programmatically on the builder or via environment variables. See `env.example` and `docs/environment-variables.md` for the full reference.

**Core:** `DEBUG`, `DEBUG_FILE`, `TEMPLATE`, `TEMPLATE_DIR`, `TEMPLATE_PATH`, `RESPONSE_DIR`, `MAX_PROMPT_LENGTH`, `MAX_BUCKET_FILES`, `MAX_CONCURRENCY`, `MAX_NESTING_DEPTH`, `MAX_RETRIES`, `RETRY_DELAY`, `RETRY_BACKOFF_MULTIPLIER`, `ENABLE_CONTENT_LENGTH_PLANNING`, `TEMPLATE_SYNTAX` (`shotput` | `jinja2`), `JINJA_AUTOESCAPE`.

**Security:** `ALLOWED_BASE_PATHS`, `ALLOW_HTTP`, `ALLOWED_DOMAINS`, `HTTP_TIMEOUT`, `HTTP_STREAM_THRESHOLD_BYTES`, `ALLOW_FUNCTIONS`, `ALLOWED_FUNCTION_PATHS`.

**S3/R2:** `S3_*` or `AWS_*` credentials, `AWS_S3_URL`, `CLOUDFLARE_R2_URL`, `S3_VIRTUAL_HOSTED_STYLE`.

**Skills:** `SKILLS_DIR`, `ALLOW_REMOTE_SKILLS`, `ALLOWED_SKILL_SOURCES`.

**Database:** `REDIS_URL` / `VALKEY_URL`, `SQLITE_ENABLED`.

Copy `env.example` to `.env` for local runs. `.env` is gitignored.

## Notes

- **Zero runtime dependencies:** The published package ships only `dist/`; devDependencies include benchmark engines (EJS, Handlebars, etc.) and tooling.
- **Two template syntaxes:** Native Shotput (`{{#if}}`, `{{#each}}`, `{{context.x}}`) and optional Jinja2 (`templateSyntax("jinja2")` or auto-detected from `.jinja`/`.j2` extensions). Jinja support is a subset validated by conformance fixtures.
- **Security-first:** Path resolution is constrained by `allowedBasePaths`; HTTP, functions, and remote skills are opt-in. See `docs/security.md`.
- **Large files:** HTTP and file sources stream above `httpStreamThresholdBytes` (default 1MB).
- **prepublishOnly:** `bun run build && bun run test` runs automatically before npm publish.
- **Publish CI** (`.github/workflows/publish.yml`): npm publish with provenance on GitHub release.
- **Ignored/generated paths:** `dist/`, `responses/`, `examples/output/`, `test-temp*/`, `templates/` (local), `node_modules/`.
- **LLM template authoring:** `llms.txt` links to `docs/llm-template-guide.txt` for syntax guidance when generating templates.
- **Downstream usage:** Used by `admin.papachriston.com` for Shotput-based prompt assembly in `templates/`.
