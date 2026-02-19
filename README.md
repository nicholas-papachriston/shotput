# Shotput

Zero dependency plug-and-play templating for Bun

## Motivation

Shotput is a simple, programmatic templating library to help manage personas, system prompts, and other text-based configurations for use in any project but particularly for Gen AI applications

## Features

- Arbitrary source retrieval and output destination
- Streaming for large files (>1MB)
- Security validation for all paths
- **Templating sources:** file paths, directory paths, functions (cjs/esm), HTTP URLs, glob patterns, regex patterns, S3 paths (including [S3 directory buckets](./docs/s3-advanced-features.md)), [Anthropic Skills](https://github.com/anthropics/skills), custom source plugins
- **Conditionals and loops:** `{{#if}}...{{else}}...{{/if}}` with `context`, `env`, and `params`; `{{#each context.list}}...{{/each}}` with `context.__loop.item` and `context.__loop.index`
- **Variable substitution:** `{{context.x}}`, `{{params.x}}`, `{{env.X}}` in template body (nested paths supported)
- **Token-aware budgeting:** optional `tokenizer` config so `maxPromptLength` is in tokens; heuristic or custom `(text) => number`
- **Lifecycle hooks:** preResolve, postResolveSource, postAssembly, preOutput
- **Output modes:** flat, sectioned, or messages (system/user/assistant)
- **Commands and subagents:** `{{command:name}}`, `{{subagent:name}}` with custom source plugins
- **Format utilities:** In-template format references expand parsed objects: `{{yaml:path}}`, `{{json:path}}`, `{{jsonl:path}}`, `{{xml:path}}`, `{{md:path}}` (path relative to template dir; YAML/JSON/JSONL/XML are parsed and expanded as formatted text; md inserts file content). Plus programmatic helpers: Markdown (to HTML or plaintext), JSONL parse (including streaming), XML parse (including S3 list response keys). Command, subagent, and skill frontmatter use Bun's YAML parser.

**Template authoring for LLMs:** [llms.txt](./llms.txt) at the project root links to the [full template guide](./docs/llm-template-guide.txt) (syntax reference, high-fidelity patterns, examples, pitfalls).

## TODO

- npm package
- blob search s3/rs support
- regex search s3/rs support

## Environment Variables

Shotput can be configured via environment variables. All configuration options can be set either through environment variables or programmatically in code.

### Core Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DEBUG` | `boolean` | `false` | Enable debug output |
| `DEBUG_FILE` | `string` | `"./templates/template_debug.txt"` | Debug output file path |
| `TEMPLATE` | `string` | - | Template content as string (overrides TEMPLATE_PATH) |
| `TEMPLATE_DIR` | `string` | `"./templates"` | Template directory |
| `TEMPLATE_PATH` | `string` | `"template.md"` | Template file name |
| `RESPONSE_DIR` | `string` | `"./responses"` | Output directory |
| `MAX_PROMPT_LENGTH` | `number` | `100000` | Maximum output length (characters, or tokens when `tokenizer` is set) |
| `MAX_BUCKET_FILES` | `number` | `100000` | Maximum files from S3 prefix |
| `MAX_CONCURRENCY` | `number` | `4` | Maximum concurrent operations |
| `MAX_RETRIES` | `number` | `3` | Maximum retry attempts for failed operations |
| `RETRY_DELAY` | `number` | `1000` | Initial retry delay in milliseconds |
| `RETRY_BACKOFF_MULTIPLIER` | `number` | `2` | Exponential backoff multiplier for retries |
| `ENABLE_CONTENT_LENGTH_PLANNING` | `boolean` | `true` | Enable planning phase with content length detection |
| `MAX_NESTING_DEPTH` | `number` | `3` | Maximum depth for nested template interpolation |

### Security Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALLOWED_BASE_PATHS` | `string` | `process.cwd()` | Comma-separated allowed base paths |
| `ALLOW_HTTP` | `boolean` | `true` | Allow HTTP/HTTPS requests |
| `ALLOWED_DOMAINS` | `string` | - | Comma-separated allowed HTTP domains |
| `HTTP_TIMEOUT` | `number` | `30000` | HTTP timeout in milliseconds |
| `ALLOW_FUNCTIONS` | `boolean` | `false` | Allow custom function execution |
| `ALLOWED_FUNCTION_PATHS` | `string` | - | Comma-separated allowed function paths |

### Skills Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SKILLS_DIR` | `string` | `"./skills"` | Local skills directory |
| `ALLOW_REMOTE_SKILLS` | `boolean` | `false` | Allow loading skills from GitHub |
| `ALLOWED_SKILL_SOURCES` | `string` | `"anthropics/skills"` | Comma-separated allowed remote sources |

### S3/R2 Configuration

Shotput supports both `S3_*` and `AWS_*` prefixes for credentials. The `S3_*` prefix takes precedence.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `S3_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID` | `string` | - | S3/AWS access key ID |
| `S3_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY` | `string` | - | S3/AWS secret access key |
| `S3_SESSION_TOKEN` or `AWS_SESSION_TOKEN` | `string` | - | S3/AWS session token (temporary credentials) |
| `S3_REGION` or `AWS_REGION` | `string` | - | S3/AWS region |
| `S3_BUCKET` or `AWS_BUCKET` | `string` | - | Default S3 bucket name |
| `AWS_S3_URL` | `string` | `"s3.amazonaws.com"` | AWS S3 endpoint URL |
| `CLOUDFLARE_R2_URL` | `string` | - | Cloudflare R2 endpoint URL |
| `S3_VIRTUAL_HOSTED_STYLE` | `boolean` | `false` | Use virtual-hosted-style URLs |

### Example `.env` File

```bash
# Debug
DEBUG=false
DEBUG_FILE=./output/debug.txt

# Templates
TEMPLATE_DIR=./templates
TEMPLATE_PATH=prompt.md
RESPONSE_DIR=./output
MAX_NESTING_DEPTH=3

# Limits
MAX_PROMPT_LENGTH=100000
MAX_BUCKET_FILES=100
MAX_CONCURRENCY=4

# Parallel Processing
MAX_RETRIES=3
RETRY_DELAY=1000
RETRY_BACKOFF_MULTIPLIER=2
ENABLE_CONTENT_LENGTH_PLANNING=true

# Security
ALLOWED_BASE_PATHS=./data,./templates
ALLOW_HTTP=true
ALLOWED_DOMAINS=api.github.com,api.example.com
ALLOW_FUNCTIONS=false

# S3/AWS
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
S3_REGION=us-east-1

# Or use Cloudflare R2
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com

# Skills
SKILLS_DIR=./skills
ALLOW_REMOTE_SKILLS=false
```

See [`env.example`](./env.example) for a complete reference.

## Usage

In the file format of you choice, simply include any combination of the following to have the file be processed by shotput:

```sh
# Files and directories
{{file_path}}
{{dir_path}}
{{relative_file_path}}

# Functions
{{TemplateType.Function:/path/to/function.js}}

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
```

### Variables, conditionals, and loops

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

### Inline Template Content

Pass template content directly as a string instead of reading from a file:

```ts
import { shotput } from "shotput";

const result = await shotput({
  template: "Hello {{./data.txt}}!",
  templateDir: "/path/to/base",
  allowedBasePaths: ["/path/to/base"],
});
console.log(result.content);

// Dynamically generated template
const dynamicTemplate = `# Report\nGenerated: ${new Date().toISOString()}\n{{./config.json}}`;
const dynamicResult = await shotput({
  template: dynamicTemplate,
  templateDir: "./data",
  allowedBasePaths: ["./data"],
});
```

**Use Cases:**
- Templates from databases or APIs
- Programmatically generated templates
- Dynamic template composition
- Testing without file I/O

**Note:** When using `template`, the `templateFile` parameter is ignored. The `templateDir` is still required for resolving relative paths in the template.

### Skill Configuration

```ts
await shotput({
  skillsDir: "./skills",
  allowRemoteSkills: false,
  allowedSkillSources: ["anthropics/skills"],
});
```

### S3/R2 Configuration

Shotput supports advanced S3 and R2 credential management. See [detailed documentation](./docs/s3-advanced-features.md).

**Environment Variables (recommended):**

```bash
# Add to .env file
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=us-east-1

# For Cloudflare R2
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
```

**Programmatic Configuration:**

```ts
await shotput({
  s3AccessKeyId: "your-access-key",
  s3SecretAccessKey: "your-secret-key",
  s3Region: "us-east-1",
  s3SessionToken: "session-token",  // optional, temporary credentials
  s3Bucket: "default-bucket",
  s3VirtualHostedStyle: false,
});
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

!! Priority when determining what files to concatenate follows the order of the template strings in your template file !!

### Parallel Processing Configuration

Shotput includes advanced parallel processing capabilities with intelligent planning and retry logic:

**Key Features:**
- **Planning Phase**: Automatically determines all files to be interpolated before processing
- **Content Length Detection**: Estimates file sizes to prevent exceeding length limits
- **Parallel Fetching**: Processes multiple templates concurrently with configurable limits
- **Smart Trimming**: Prioritizes templates based on type and order when approaching length limits
- **Retry Logic**: Handles transient failures with exponential backoff

**Configuration:**

```ts
await shotput({
  maxConcurrency: 4,
  enableContentLengthPlanning: true,
  maxRetries: 3,
  retryDelay: 1000,
  retryBackoffMultiplier: 2,
});
```

**How It Works:**

1. **Planning**: Parses template to identify all interpolation patterns
2. **Estimation**: Attempts to detect content length for each template (HEAD requests for HTTP, file stats for files)
3. **Prioritization**: Assigns priority based on template type (files > HTTP > directories > globs)
4. **Trimming**: Removes low-priority templates if total size exceeds `maxPromptLength`
5. **Parallel Processing**: Fetches selected templates concurrently with semaphore-based rate limiting
6. **Retry**: Automatically retries failed operations with exponential backoff

**Template Priority Order** (highest to lowest):
1. Files (`TemplateType.File`)
2. HTTP resources (`TemplateType.Http`)
3. S3 objects (`TemplateType.S3`)
4. Glob patterns (`TemplateType.Glob`)
5. Regex patterns (`TemplateType.Regex`)
6. Directories (`TemplateType.Directory`)
7. Functions (`TemplateType.Function`)
8. Skills (`TemplateType.Skill`)

**Performance Benefits:**

Parallel processing can significantly improve performance when working with multiple templates:
- 4-8 concurrent operations: typical 40-60% speedup
- Network-bound operations (HTTP, S3): greatest improvement
- Local files: modest improvement due to I/O parallelization

**Token-aware budgeting:** Set `tokenizer` so planning and truncation use token counts instead of characters (e.g. `tokenizer: "cl100k_base"` or a custom `(text) => number`). Then `maxPromptLength` is in tokens.

**Disabling parallel processing:**

```ts
await shotput({
  enableContentLengthPlanning: false,
  maxConcurrency: 1,
});
```

## API

### `shotput(config?: Partial<ShotputConfig>): Promise<ShotputOutput>`

Processes the template with optional configuration overrides and returns the result. No separate `.run()` call; invoke as `await shotput({ ... })`.

**Parameters:**

- `config` (optional): Configuration object with the following properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `template` | `string` | `undefined` | Template content as string (overrides `templateFile`) |
| `templateDir` | `string` | `"./templates"` | Base directory for template files and relative path resolution |
| `templateFile` | `string` | `"template.md"` | Template file name (ignored if `template` is provided) |
| `responseDir` | `string` | `"./responses"` | Output directory for response files |
| `debug` | `boolean` | `false` | Enable debug output |
| `debugFile` | `string` | `"./templates/template_debug.txt"` | Debug output file path |
| `maxPromptLength` | `number` | `100000` | Maximum output length in characters |
| `allowedBasePaths` | `string[]` | `[process.cwd()]` | Allowed base paths for file access |
| `allowHttp` | `boolean` | `true` | Allow HTTP/HTTPS requests |
| `allowedDomains` | `string[]` | `[]` | Allowed HTTP domains (empty = all allowed) |
| `httpTimeout` | `number` | `30000` | HTTP request timeout in milliseconds |
| `allowFunctions` | `boolean` | `false` | Allow custom function execution |
| `allowedFunctionPaths` | `string[]` | `[]` | Allowed paths for function execution |
| `skillsDir` | `string` | `"./skills"` | Local skills directory |
| `allowRemoteSkills` | `boolean` | `false` | Allow loading skills from GitHub |
| `allowedSkillSources` | `string[]` | `["anthropics/skills"]` | Allowed remote skill sources |
| `s3AccessKeyId` | `string` | `undefined` | AWS S3 access key ID |
| `s3SecretAccessKey` | `string` | `undefined` | AWS S3 secret access key |
| `s3SessionToken` | `string` | `undefined` | AWS S3 session token (for temporary credentials) |
| `s3Region` | `string` | `undefined` | AWS S3 region |
| `s3Bucket` | `string` | `undefined` | Default S3 bucket name |
| `awsS3Url` | `string` | `"s3.amazonaws.com"` | AWS S3 endpoint URL |
| `cloudflareR2Url` | `string` | `undefined` | Cloudflare R2 endpoint URL |
| `s3VirtualHostedStyle` | `boolean` | `false` | Use virtual-hosted-style URLs for S3 |
| `maxConcurrency` | `number` | `4` | Maximum concurrent operations |
| `maxBucketFiles` | `number` | `100000` | Maximum files to fetch from S3 prefix |
| `maxRetries` | `number` | `3` | Maximum retry attempts for failed operations |
| `retryDelay` | `number` | `1000` | Initial retry delay in milliseconds |
| `retryBackoffMultiplier` | `number` | `2` | Exponential backoff multiplier for retries |
| `enableContentLengthPlanning` | `boolean` | `true` | Enable planning phase with content length detection and trimming (does not gate path; all interpolation uses unified parallel flow) |
| `maxNestingDepth` | `number` | `3` | Maximum depth for nested template interpolation |
| `context` | `Record<string, unknown>` | `undefined` | Context for rules and variable substitution |
| `expressionEngine` | `"js"` \| `"safe"` | `"js"` | Condition evaluation: full JS or safe subset |
| `tokenizer` | `"openai"` \| `"cl100k_base"` \| `(text: string) => number` | `undefined` | When set, `maxPromptLength` is in tokens |
| `hooks` | `HookSet` | `undefined` | Lifecycle hooks (preResolve, postResolveSource, postAssembly, preOutput) |
| `outputMode` | `"flat"` \| `"sectioned"` \| `"messages"` | `"flat"` | Output shape |
| `sectionBudgets` | `Record<string, number>` | `undefined` | Per-section length limits (sectioned mode) |
| `sectionRoles` | `Record<string, "system" \| "user" \| "assistant">` | `undefined` | Section to role mapping (messages mode) |
| `commandsDir` | `string` | `undefined` | Directory for command templates |
| `subagentsDir` | `string` | `undefined` | Directory for subagent definitions |
| `parseSubagentFrontmatter` | `boolean` | `false` | Strip YAML frontmatter and set `output.frontmatter` |
| `customSources` | `SourcePlugin[]` | `undefined` | Custom source plugins |

**Returns:**

`Promise<ShotputOutput>`:

```ts
interface ShotputOutput {
  content?: string;           // Processed template content (flat mode)
  sections?: Section[];       // Parsed sections (sectioned mode)
  messages?: MessageOutput[]; // System/user/assistant (messages mode)
  frontmatter?: Record<string, unknown>; // When parseSubagentFrontmatter and frontmatter present
  error?: Error;              // Set when processing threw
  metadata: {
    duration: number;         // Processing time in ms
    outputMode?: OutputMode;
    resultMetadata?: Array<{ path: string; type: string; duration: number }>;
  };
}
```

**Example:**

```ts
import { shotput } from "shotput";

// File-based template (shotput returns a Promise)
const result = await shotput({
  templateDir: "./templates",
  templateFile: "prompt.md",
  allowedBasePaths: ["./data"],
  allowHttp: true,
});

console.log(result.content);
console.log(`Duration: ${result.metadata.duration}ms`);

// Inline template with context and variables
const inlineResult = await shotput({
  template: "Task: {{context.taskName}}\n{{./data.txt}}",
  templateDir: "./data",
  allowedBasePaths: ["./data"],
  context: { taskName: "review" },
});
console.log(inlineResult.content);
```

### `shotputStreaming(config?: Partial<ShotputConfig>): Promise<ShotputStreamingOutput>`

Streams resolved segments in document order as each placeholder is resolved. Same pipeline as `shotputStreamingSegments`; returns `{ stream, metadata }` (no literalMap). PostAssembly, preOutput, and sectioning are not run.

### `shotputStreamingSegments(config?: Partial<ShotputConfig>): Promise<ShotputSegmentStreamOutput>`

Streams segments in document order as each `{{path}}` placeholder is resolved (prefix, replacement, suffix). Uses the same template load and preResolve hooks as `shotput`, then yields segments without running postAssembly, preOutput, or sectioning; consumers can concatenate and run hooks if needed. All interpolation uses the unified parallel flow (ordered drain); `maxConcurrency=1` uses the same flow via semaphore. Concatenation equals `interpolation().processedTemplate`. `literalMap` is set when custom sources emit literal placeholders.

**Returns:** `{ stream: ReadableStream<string>; metadata: Promise<...>; literalMap?: Map<string, string>; literalMapPromise?: Promise<...>; error?: Error }`. Use `literalMap` for client-side substitution when custom sources emit literal placeholders.

### Format utilities

**In-template format references** — Use a format prefix to parse and expand the file as structured content in the template (path is relative to the template directory, validated against `allowedBasePaths`):

| Placeholder | Behavior |
|-------------|----------|
| `{{yaml:path/to/file.yaml}}` | Parse YAML and expand as formatted JSON. |
| `{{json:path/to/file.json}}` | Parse JSON and expand as pretty-printed JSON. |
| `{{jsonl:path/to/file.jsonl}}` | Parse JSONL and expand as JSON array. |
| `{{xml:path/to/file.xml}}` | Parse XML and expand as formatted XML string. |
| `{{md:path/to/file.md}}` | Insert file content as-is (no parse). |

**Programmatic helpers** (re-exported for use on resolved content or external data):

| Export | Description |
|--------|-------------|
| `markdownToHtml(text, options?)` | Render Markdown to HTML (GFM supported). See [Bun Markdown](https://bun.com/docs/runtime/markdown). |
| `markdownToPlaintext(text)` | Strip Markdown to plain text (for prompts or length estimation). |
| `parseJsonl(input)` | Parse full JSONL string or Uint8Array to array of values. See [Bun JSONL](https://bun.com/docs/runtime/jsonl). |
| `parseJsonlChunk(input, start?, end?)` | Parse JSONL chunk for streaming; returns `{ values, read, done, error }`. |
| `parseXml(xmlString)` | Parse XML to an `XmlNode` tree (tag, attributes, children, text). |
| `xmlNodeToString(node)` | Serialize an `XmlNode` back to an XML string. |
| `parseS3ListResponse(xmlString)` | Extract `<Key>` values from S3 ListObjects XML response. |
| `createXmlParser()` | Factory for XML parser (parse, parseS3ListResponse). |
| `XmlNode` | Type for parsed XML nodes. |

Command, subagent, and skill frontmatter are parsed with Bun's YAML API internally.

### `compileShotputTemplate(template, baseConfig?): (overrides?) => Promise<ShotputOutput>`

Pre-compiles a template string and returns a render function. Use when rendering the same template many times with varying context; the block parse cache is warmed once.

### `resolveSubagent(config): Promise<ResolvedSubagent>`

Load a subagent definition file (path via `subagentFile`), parse YAML frontmatter, resolve the body as a template, and return `{ systemPrompt, agentConfig, metadata }`. Use with agent frameworks that consume system prompts and config.

## Examples

Comprehensive examples are in [`examples/`](./examples/):

### Basic

- **[01-simple-file.ts](./examples/basic/01-simple-file.ts)** - Simple file interpolation
- **[02-multiple-files.ts](./examples/basic/02-multiple-files.ts)** - Multiple files
- **[03-directory.ts](./examples/basic/03-directory.ts)** - Directory inclusion
- **[04-glob-patterns.ts](./examples/basic/04-glob-patterns.ts)** - Glob patterns
- **[05-regex-patterns.ts](./examples/basic/05-regex-patterns.ts)** - Regex file paths
- **[06-http.ts](./examples/basic/06-http.ts)** - HTTP URLs
- **[07-functions.ts](./examples/basic/07-functions.ts)** - Custom JavaScript functions
- **[08-skills.ts](./examples/basic/08-skills.ts)** - Anthropic Skills
- **[09-inline-template.ts](./examples/basic/09-inline-template.ts)** - Template strings
- **[10-parallel-simple.ts](./examples/basic/10-parallel-simple.ts)** - Parallel processing
- **[11-rules.ts](./examples/basic/11-rules.ts)** - Conditionals (`{{#if}}`)
- **[12-hooks.ts](./examples/basic/12-hooks.ts)** - Lifecycle hooks
- **[13-output-modes.ts](./examples/basic/13-output-modes.ts)** - Flat, sectioned, messages
- **[14-commands.ts](./examples/basic/14-commands.ts)** - Commands
- **[15-subagents.ts](./examples/basic/15-subagents.ts)** - Subagents
- **[16-variables.ts](./examples/basic/16-variables.ts)** - Variable substitution (`{{context.x}}`, `{{params.x}}`, `{{env.X}}`)
- **[17-each.ts](./examples/basic/17-each.ts)** - Loops (`{{#each}}`)
- **[18-format-markdown.ts](./examples/basic/18-format-markdown.ts)** - Markdown to HTML or plaintext
- **[19-format-jsonl.ts](./examples/basic/19-format-jsonl.ts)** - JSONL parse and streaming
- **[20-format-xml.ts](./examples/basic/20-format-xml.ts)** - XML parse and S3 list response
- **[21-format-references.ts](./examples/basic/21-format-references.ts)** - All format references (yaml, json, jsonl, xml, md)

### Advanced

- **[01-s3-basic.ts](./examples/advanced/01-s3-basic.ts)** - S3 basics
- **[02-s3-directory-buckets.ts](./examples/advanced/02-s3-directory-buckets.ts)** - S3 directory buckets
- **[03-s3-cloudflare-r2.ts](./examples/advanced/03-s3-cloudflare-r2.ts)** - Cloudflare R2
- **[04-streaming.ts](./examples/advanced/04-streaming.ts)** - Streaming large files
- **[05-security.ts](./examples/advanced/05-security.ts)** - Security and path validation
- **[06-length-limits.ts](./examples/advanced/06-length-limits.ts)** - Length limits and truncation
- **[07-mixed-sources.ts](./examples/advanced/07-mixed-sources.ts)** - Mixed source types
- **[08-remote-skills.ts](./examples/advanced/08-remote-skills.ts)** - Remote skills
- **[09-parallel-processing.ts](./examples/advanced/09-parallel-processing.ts)** - Parallel planning and retry
- **[10-nested-templates.ts](./examples/advanced/10-nested-templates.ts)** - Nested templates
- **[11-nested-mixed-sources.ts](./examples/advanced/11-nested-mixed-sources.ts)** - Nested mixed sources
- **[12-custom-source.ts](./examples/advanced/12-custom-source.ts)** - Custom source plugins
- **[13-token-budgeting.ts](./examples/advanced/13-token-budgeting.ts)** - Token-aware budgeting

### Running examples

```bash
# Run a single example
bun run examples/basic/01-simple-file.ts

# Run all examples
bun run examples
```

Each example includes:
- Clear documentation and comments
- Step-by-step explanations
- Expected output
- Key takeaways and best practices

See the [examples README](./examples/README.md) for complete documentation.

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
