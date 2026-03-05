# Shotput

[![npm](https://img.shields.io/npm/v/@agent_oxide/shotput)](https://www.npmjs.com/package/@agent_oxide/shotput)
[![github](https://img.shields.io/github/stars/nicholas-papachriston/shotput)](https://github.com/nicholas-papachriston/shotput)

Zero dependency plug-and-play templating for Bun

## Installation

```bash
bun add @agent_oxide/shotput
```

## Motivation

Shotput is a programmatic templating library for managing personas, system prompts, and other text-based configurations. It works in any Bun project but is particularly useful for Gen AI applications.

## Features

- Arbitrary source retrieval and output destination
- Streaming for large files (>1MB)
- Security validation for all paths
- **Templating sources:** file paths, directory paths, glob/regex, HTTP, S3 (including directory buckets), functions, [Anthropic Skills](https://github.com/anthropics/skills), SQLite, Redis, custom source plugins
- **Conditionals and loops:** `{{#if}}` / `{{#each}}` with `context`, `env`, `params`
- **Optional native Jinja2 syntax mode:** `{% if %}`, `{% elif %}`, `{% else %}`, `{% for %}` (+ `else`), `{% set %}`, `{% with %}`, `{% macro %}`, `{% raw %}`, `{% include "..." %}`, filters/tests via `templateSyntax("jinja2")` (or auto-detected from `.jinja`, `.jinja2`, `.j2` template files)
- **Variable substitution:** `{{context.x}}`, `{{params.x}}`, `{{env.X}}` (nested paths supported)
- **Token-aware budgeting and semantic compression:** optional `tokenizer` and `compressor`
- **Lifecycle hooks:** preResolve, postResolveSource, postAssembly, preOutput
- **Output modes:** flat, sectioned, or messages (system/user/assistant)
- **Commands and subagents:** `{{command:name}}`, `{{subagent:name}}`
- **Format utilities:** in-template `{{yaml:path}}`, `{{json:path}}`, `{{jsonl:path}}`, `{{xml:path}}`, `{{md:path}}`, `{{jinja:path}}`; programmatic Markdown, JSONL, XML helpers

**Template authoring for LLMs:** [llms.txt](./llms.txt) links to the [template guide](docs/llm-template-guide.txt) (syntax, patterns, pitfalls).

## Benchmarks

Benchmark suite comparing Shotput against EJS, Handlebars, Mustache, Nunjucks, Binja, and Jinja2.
See [examples/benchmark](./examples/benchmark) for full methodology and current results.

```bash
bun run benchmark
```

The benchmark includes:

- Runtime (parse + render)
- Pre-compiled (render-only)
- Jinja parse/compile-only (Shotput native Jinja, Binja, CPython Jinja2)

## Quick start

```ts
import { shotput } from "@agent_oxide/shotput";

const result = await shotput()
  .templateDir("./templates")
  .templateFile("prompt.md")
  .allowedBasePaths(["./data"])
  .run();

console.log(result.content);
```

**API:** `shotput()` returns a builder. Chain config (e.g. `.templateDir()`, `.context()`, `.allowedBasePaths()`), then `.run()`, `.stream()`, `.streamSegments()`, or `.build()`.

## Documentation

- [Usage](docs/usage.md) - Template syntax, variables, S3/R2, parallel processing
- [API Reference](docs/api.md) - Builder setters, types, format utilities, examples list
- [Environment Variables](docs/environment-variables.md) - All env configuration
- [Security](docs/security.md) - Best practices and vulnerabilities

## Scripts

| Command | Description |
| --------- | ----------- |
| `bun run build` | Build dist (Bun bundle + single `index.d.ts` via dts-bundle-generator) |
| `bun test` | Run all tests |
| `bun run test:conformance` | Strict Jinja2 parity test against live CPython Jinja2 output |
| `bun run conformance:generate` | Generate CPython Jinja2 snapshots (`test/conformance/expected.json`) |
| `bun run examples` | Run all examples |
| `bun run lint` | Run Biome check |
| `bun run typecheck` | TypeScript check |

## Prerequisites

- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/)
- [Python 3](https://www.python.org/)
- [jinja2](https://pypi.org/project/Jinja2/) package for conformance harness (`uv add jinja2` or `pip install jinja2`)

## Jinja2 Support Scope

Shotput's native Jinja engine currently supports:

- Output expressions: `{{ expr }}`
- Control flow: `if/elif/else`, `for`, `for ... else`
- Assignments and scope: `set`, `with`
- Macros: `macro` declarations and macro invocation
- Delimiter features: comments `{# ... #}` and `raw` blocks
- Includes: `{% include "path/to/partial.jinja" %}` (resolved before compile)
- Filters: `trim`, `upper`, `lower`, `default`, `length`
- Tests: `divisibleby`, `defined`, `undefined`, `odd`, `even`

Conformance coverage is validated against CPython Jinja2 using fixtures in `test/conformance/fixtures` and the Python renderer `test/conformance/jinja2_render.py`.
