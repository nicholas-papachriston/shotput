# Templating benchmark: Shotput vs Jinja2, EJS, Handlebars, Nunjucks, Mustache, Binja

Same large input (template + context) across engines; each run is timed. The workload is intensive: 20,000 items in a loop, 8,000 conditionals, 1,000 extra variables.

## Common input

- **Context:** 20,000 items (`{ id, name, value, tags, isHigh }`), 8,000 boolean flags, 1,000 extra string keys, nested `meta`.
- **Template:** Variables, 8,000 `{{#if}}`/`{% if %}` blocks, one `{{#each}}`/`{% for %}` over all items with nested tag iteration, 1,000 variable outputs.
- **Output:** ~1.8M-2.4M characters per run depending on engine semantics.

## Methodology

- **Measured samples:** 20 measured runs after 3 warmup runs for each engine.
- **Process isolation:** each engine benchmark runs in its own subprocess to avoid heap/GC cross-contamination.
- **Variance reporting:** output includes median, mean, stddev, p95, and 95% confidence interval.
- **Memory reporting:** reports per-run heap delta (post-GC minus pre-GC) with avg and p95.
- **Execution-model grouping:** results are printed in two tables:
  - Runtime (parse + render per call)
  - Pre-compiled (render-only mode)
- **Autoescape normalization:** Jinja-style engines in this suite run with `autoescape: false` for parity.

## Run Bun engines (Shotput, EJS, Handlebars, Nunjucks, Mustache, Binja)

From repo root, install deps and run:

```bash
bun install
bun run benchmark
```

Or: `bun run examples/benchmark/run-all.ts`

Or run a single engine:

```bash
bun run examples/benchmark/shotput.ts
bun run examples/benchmark/ejs.ts
bun run examples/benchmark/handlebars.ts
bun run examples/benchmark/nunjucks.ts
bun run examples/benchmark/mustache.ts
bun run examples/benchmark/binja.ts
```

## Run Jinja2 (Python)

Requires Python 3 and Jinja2. From repo root:

```bash
# With uv (installs jinja2 on the fly if needed)
uv run --with jinja2 examples/benchmark/jinja2_benchmark.py

# Or with pip
pip install jinja2
python examples/benchmark/jinja2_benchmark.py
```

## Results

`run-all.ts` prints grouped tables for runtime and pre-compiled modes. Relative speed is calculated within each group (1.00x = fastest in that group).

## Similar libs

- **Shotput** (Bun): This repo; `{{context.x}}`, `{{#if}}`, `{{#each}}`, file/HTTP/glob includes.
- **Jinja2** (Python): Widely used; `{{ x }}`, `{% if %}`, `{% for %}`, inheritance, filters.
- **EJS** (Node/Bun): Embeds JS; `<%= x %>`, `<% if %>`, `<% items.forEach %>`.
- **Handlebars** (Node/Bun): Logic-less style; `{{x}}`, `{{#if}}`, `{{#each}}`, helpers.
- **Nunjucks** (Node/Bun): Jinja-like; `{{ x }}`, `{% if %}`, `{% for %}`, async, inheritance.
- **Mustache** (Node/Bun): Logic-less; `{{x}}`, `{{#section}}`, `{{^inverted}}`.
- **Binja** (Bun): Jinja2/DTL multi-engine; `{{ x }}`, `{% if %}`, `{% for %}`, 84 filters, AOT compile.
