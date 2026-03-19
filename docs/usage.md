# Usage

In the text file format of your choice, include any combination of the following to have the file processed by Shotput:

## Template syntax

```sh
# Files and directories
{{file_path}}
{{dir_path}}
{{relative_file_path}}

# Functions
{{TemplateType.Function:/path/to/function.js}}

# Shell
{{shell:printf "hello"}}

# Glob patterns
{{/usr/local/app/*.ts}}

# HTTP
{{http://example.com/data.json}}

# S3
{{s3://bucket/path/to/file.json}}
{{s3://bucket/prefix/}}

# Regex
{{\regex\/g}}

# Anthropic Skills (local)
{{skill:brand-guidelines}}
{{skill:mcp-builder:full}}  # includes reference files

# Anthropic Skills (remote, requires allowRemoteSkills: true)
{{skill:github:anthropics/skills/brand-guidelines}}

# Format references
{{yaml:./data.yaml}}
{{json:./data.json}}
{{jsonl:./events.jsonl}}
{{xml:./config.xml}}
{{md:./notes.md}}
{{jinja:./partial.jinja}}
```

## Native Jinja templates

Use Jinja syntax for the root template in either of these ways:

- Set `.templateSyntax("jinja2")`
- Or set `.templateFile("prompt.jinja")` (also supports `.jinja2` and `.j2`), which auto-selects Jinja mode unless `templateSyntax` is explicitly provided

Jinja templates support include preprocessing:

```jinja
{% include "./partials/header.jinja" %}
```

## Variables, conditionals, and loops

Inject context, params, and env directly into the template body, and use conditionals or loops:

```sh
# Variable substitution (after rules, before source resolution)
{{context.taskName}}
{{params.requestId}}
{{env.USER}}

# Conditionals (context, env, params in expressions)
{{#if context.env == "prod"}}Production{{else}}Other{{/if}}

# Loops over arrays (context.* or params.*)
{{#each context.items}}
- {{context.__loop.index}}: {{context.__loop.item}}
{{/each}}
```

- **Variables:** `{{context.x}}`, `{{params.x}}`, `{{env.X}}` (nested paths like `{{context.project.name}}` supported). Missing keys become empty string.
- **Conditionals:** `{{#if expr}}...{{else}}...{{/if}}`. Use `expressionEngine: "safe"` to restrict to simple comparisons and `context`/`env`/`params` paths.
- **Loops:** `{{#each context.list}}...{{/each}}`. Inside the block, `{{context.__loop.item}}` is the current element and `{{context.__loop.index}}` is the zero-based index. Non-arrays are treated as single-element; empty/missing as empty.
- **Shell:** `{{shell:...}}` executes in a system shell and interpolates stdout. Enable with `.allowShell(true)` (or `ALLOW_SHELL=true`). Optional timeout via `.shellTimeoutMs(ms)` / `SHELL_TIMEOUT_MS`.

## Inline template content

Pass template content directly as a string instead of reading from a file:

```ts
import { shotput } from "@agent_oxide/shotput";

const result = await shotput()
  .template("Hello {{./data.txt}}!")
  .templateDir("/path/to/base")
  .allowedBasePaths(["/path/to/base"])
  .run();
console.log(result.content);

// Dynamically generated template
const dynamicTemplate = `# Report\nGenerated: ${new Date().toISOString()}\n{{./config.json}}`;
const dynamicResult = await shotput()
  .template(dynamicTemplate)
  .templateDir("./data")
  .allowedBasePaths(["./data"])
  .run();
```

**Use cases:**

- Templates from databases or APIs
- Programmatically generated templates
- Dynamic template composition
- Testing without file I/O

**Note:** When using `template`, the `templateFile` parameter is ignored. The `templateDir` is still required for resolving relative paths in the template.

## Skill configuration

```ts
await shotput()
  .skillsDir("./skills")
  .allowRemoteSkills(false)
  .allowedSkillSources(["anthropics/skills"])
  .run();
```

## S3/R2 configuration

Shotput supports advanced S3 and R2 credential management.

**Environment variables (recommended):**

```bash
# Add to .env file
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=us-east-1

# For Cloudflare R2
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
```

**Programmatic configuration:**

```ts
await shotput()
  .s3AccessKeyId("your-access-key")
  .s3SecretAccessKey("your-secret-key")
  .s3Region("us-east-1")
  .s3SessionToken("session-token")  // optional, temporary credentials
  .s3Bucket("default-bucket")
  .s3VirtualHostedStyle(false)
  .run();
```

**S3 Directory Buckets (AWS S3 Express One Zone):**

```markdown
<!-- Standard S3 bucket -->
{{s3://my-bucket/file.json}}

<!-- Directory bucket (automatically detected) -->
{{s3://my-data--use1-az4--x-s3/logs/app.log}}
{{s3://logs--usw2-az1--x-s3/2024/01/}}
```

Directory buckets provide single-digit millisecond latency and are automatically detected by their naming pattern: `bucket-name--azid--x-s3`

> **Note:** Priority when determining what files to concatenate follows the order of the template strings in your template file.

## Parallel processing

Shotput includes advanced parallel processing capabilities with intelligent planning and retry logic:

**Key features:**

- **Planning Phase**: Automatically determines all files to be interpolated before processing
- **Content Length Detection**: Estimates file sizes to prevent exceeding length limits
- **Parallel Fetching**: Processes multiple templates concurrently with configurable limits
- **Smart Trimming**: Prioritizes templates based on type and order when approaching length limits
- **Retry Logic**: Handles transient failures with exponential backoff

**Configuration:**

```ts
await shotput()
  .maxConcurrency(4)
  .enableContentLengthPlanning(true)
  .maxRetries(3)
  .retryDelay(1000)
  .retryBackoffMultiplier(2)
  .compressor(async (content, { maxBudget }) => {
    // shrink low priority content if needed
    return content.slice(0, maxBudget);
  })
  .run();
```

**How it works:**

1. **Planning**: Parses template to identify all interpolation patterns
2. **Estimation**: Attempts to detect content length for each template (HEAD requests for HTTP, file stats for files)
3. **Prioritization**: Assigns priority based on template type (files > HTTP > directories > globs)
4. **Trimming**: Removes low-priority templates if total size exceeds `maxPromptLength` (or semantically compresses them if a `compressor` is configured)
5. **Parallel Processing**: Fetches selected templates concurrently with semaphore-based rate limiting
6. **Retry**: Automatically retries failed operations with exponential backoff

**Template priority order** (highest to lowest):

1. Files (`TemplateType.File`)
2. HTTP resources (`TemplateType.Http`)
3. S3 objects (`TemplateType.S3`)
4. Glob patterns (`TemplateType.Glob`)
5. Regex patterns (`TemplateType.Regex`)
6. Directories (`TemplateType.Directory`)
7. Functions (`TemplateType.Function`)
8. Skills (`TemplateType.Skill`)

**Performance benefits:**

- 4-8 concurrent operations: typical 40-60% speedup
- Network-bound operations (HTTP, S3): greatest improvement
- Local files: modest improvement due to I/O parallelization

**Token-aware budgeting and semantic compression:** Set `tokenizer` so planning and truncation use token counts instead of characters (e.g. `tokenizer: "cl100k_base"` or a custom `(text) => number`). Set `compressor` to semantically compress files before hitting budget limits.

**Disabling parallel processing:**

```ts
await shotput()
  .enableContentLengthPlanning(false)
  .maxConcurrency(1)
  .run();
```
