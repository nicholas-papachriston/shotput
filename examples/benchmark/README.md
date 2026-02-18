# Templating benchmark: Shotput vs Jinja2, EJS, Handlebars, Nunjucks, Mustache

Same large input (template + context) across engines; each run is timed. The workload is intensive: 2000 items in a loop, 80 conditionals, 100 extra variables.

## Common input

- **Context:** 2000 items (`{ id, name, value }`), 80 boolean flags, 100 extra string keys, nested `meta`.
- **Template:** Variables, 80 `{{#if}}`/`{% if %}` blocks, one `{{#each}}`/`{% for %}` over all items, 100 variable outputs.
- **Output:** ~150k+ characters per run.

## Run Bun engines (Shotput, EJS, Handlebars, Nunjucks, Mustache)

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

`run-all.ts` prints median and average ms per engine and a relative speed column (1.00x = fastest). Jinja2 is run separately; compare its median ms to the table.

## Similar libs

- **Shotput** (Bun): This repo; `{{context.x}}`, `{{#if}}`, `{{#each}}`, file/HTTP/glob includes.
- **Jinja2** (Python): Widely used; `{{ x }}`, `{% if %}`, `{% for %}`, inheritance, filters.
- **EJS** (Node/Bun): Embeds JS; `<%= x %>`, `<% if %>`, `<% items.forEach %>`.
- **Handlebars** (Node/Bun): Logic-less style; `{{x}}`, `{{#if}}`, `{{#each}}`, helpers.
- **Nunjucks** (Node/Bun): Jinja-like; `{{ x }}`, `{% if %}`, `{% for %}`, async, inheritance.
- **Mustache** (Node/Bun): Logic-less; `{{x}}`, `{{#section}}`, `{{^inverted}}`.
