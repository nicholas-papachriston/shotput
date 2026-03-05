# Shotput

Zero dependency plug-and-play templating for Bun

## Installation

```bash
bun add shotput
```

## Motivation

Shotput is a programmatic templating library for managing personas, system prompts, and other text-based configurations. It works in any Bun project but is particularly useful for Gen AI applications.

## Features

- Arbitrary source retrieval and output destination
- Streaming for large files (>1MB)
- Security validation for all paths
- **Templating sources:** file paths, directory paths, glob/regex, HTTP, S3 (including directory buckets), functions, [Anthropic Skills](https://github.com/anthropics/skills), SQLite, Redis, custom source plugins
- **Conditionals and loops:** `{{#if}}` / `{{#each}}` with `context`, `env`, `params`
- **Variable substitution:** `{{context.x}}`, `{{params.x}}`, `{{env.X}}` (nested paths supported)
- **Token-aware budgeting and semantic compression:** optional `tokenizer` and `compressor`
- **Lifecycle hooks:** preResolve, postResolveSource, postAssembly, preOutput
- **Output modes:** flat, sectioned, or messages (system/user/assistant)
- **Commands and subagents:** `{{command:name}}`, `{{subagent:name}}`
- **Format utilities:** in-template `{{yaml:path}}`, `{{json:path}}`, etc.; programmatic Markdown, JSONL, XML helpers

**Template authoring for LLMs:** [llms.txt](./llms.txt) links to the [template guide](docs/llm-template-guide.txt) (syntax, patterns, pitfalls).

## Quick start

```ts
import { shotput } from "shotput";

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
|---------|-------------|
| `bun run build` | Build dist (Bun bundle + single `index.d.ts` via dts-bundle-generator) |
| `bun test` | Run all tests |
| `bun run examples` | Run all examples |
| `bun run lint` | Run Biome check |
| `bun run typecheck` | TypeScript check |

## Prerequisites

- [Bun](https://bun.sh)
