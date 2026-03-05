# API Reference

## `shotput(): ShotputBuilder`

Returns an empty builder. Chain config setters, then execute:

- `.run()` -- full pipeline, returns `Promise<ShotputOutput>`
- `.stream()` -- streaming, returns `Promise<ShotputStreamingOutput>`
- `.streamSegments()` -- streaming with literal map, returns `Promise<ShotputSegmentStreamOutput>`
- `.build()` -- returns an immutable `ShotputProgram` to store and reuse
- `.with(overrides)` -- merge a config object and return a new builder (bulk overrides)

### Chainable config setters

Each setter returns a new instance:

| Setter | Type | Default | Description |
|--------|------|---------|-------------|
| `.template(v)` | `string` | `undefined` | Template content as string (overrides `templateFile`) |
| `.templateDir(v)` | `string` | `"./templates"` | Base directory for template files and relative path resolution |
| `.templateFile(v)` | `string` | `"template.md"` | Template file name (ignored if `template` is set) |
| `.responseDir(v)` | `string` | `"./responses"` | Output directory for response files |
| `.debug(v)` | `boolean` | `false` | Enable debug output |
| `.debugFile(v)` | `string` | `"./templates/template_debug.txt"` | Debug output file path |
| `.maxPromptLength(v)` | `number` | `100000` | Maximum output length in characters (or tokens when `tokenizer` is set) |
| `.allowedBasePaths(v)` | `string[]` | `[process.cwd()]` | Allowed base paths for file access |
| `.allowHttp(v)` | `boolean` | `true` | Allow HTTP/HTTPS requests |
| `.allowedDomains(v)` | `string[]` | `[]` | Allowed HTTP domains (empty = all allowed) |
| `.httpTimeout(v)` | `number` | `30000` | HTTP request timeout in milliseconds |
| `.httpStreamThresholdBytes(v)` | `number` | `1048576` | Byte threshold above which HTTP responses stream |
| `.allowFunctions(v)` | `boolean` | `false` | Allow custom function execution |
| `.allowedFunctionPaths(v)` | `string[]` | `[]` | Allowed paths for function execution |
| `.skillsDir(v)` | `string` | `"./skills"` | Local skills directory |
| `.allowRemoteSkills(v)` | `boolean` | `false` | Allow loading skills from GitHub |
| `.allowedSkillSources(v)` | `string[]` | `["anthropics/skills"]` | Allowed remote skill sources |
| `.s3AccessKeyId(v)` | `string` | `undefined` | AWS S3 access key ID |
| `.s3SecretAccessKey(v)` | `string` | `undefined` | AWS S3 secret access key |
| `.s3SessionToken(v)` | `string` | `undefined` | AWS S3 session token (temporary credentials) |
| `.s3Region(v)` | `string` | `undefined` | AWS S3 region |
| `.s3Bucket(v)` | `string` | `undefined` | Default S3 bucket name |
| `.awsS3Url(v)` | `string` | `"s3.amazonaws.com"` | AWS S3 endpoint URL |
| `.cloudflareR2Url(v)` | `string` | `undefined` | Cloudflare R2 endpoint URL |
| `.s3VirtualHostedStyle(v)` | `boolean` | `false` | Use virtual-hosted-style URLs for S3 |
| `.maxConcurrency(v)` | `number` | `4` | Maximum concurrent operations |
| `.maxBucketFiles(v)` | `number` | `100000` | Maximum files to fetch from S3 prefix |
| `.maxRetries(v)` | `number` | `3` | Maximum retry attempts for failed operations |
| `.retryDelay(v)` | `number` | `1000` | Initial retry delay in milliseconds |
| `.retryBackoffMultiplier(v)` | `number` | `2` | Exponential backoff multiplier for retries |
| `.enableContentLengthPlanning(v)` | `boolean` | `true` | Enable planning phase with content length detection and trimming |
| `.maxNestingDepth(v)` | `number` | `3` | Maximum depth for nested template interpolation |
| `.context(v)` | `Record<string, unknown>` | `undefined` | Context for rules and variable substitution |
| `.expressionEngine(v)` | `"js"` \| `"safe"` | `"js"` | Condition evaluation: full JS or safe subset |
| `.tokenizer(v)` | `"openai"` \| `"cl100k_base"` \| `(text: string) => number` | `undefined` | When set, `maxPromptLength` is in tokens |
| `.tokenizerWorker(v)` | `string` | `undefined` | Path to a worker script for off-thread tokenization |
| `.compressor(v)` | `SemanticCompressor` | `undefined` | Function to semantically compress content for low-priority sources |
| `.hooks(v)` | `HookSet` | `undefined` | Lifecycle hooks (preResolve, postResolveSource, postAssembly, preOutput) |
| `.outputMode(v)` | `"flat"` \| `"sectioned"` \| `"messages"` | `"flat"` | Output shape |
| `.sectionBudgets(v)` | `Record<string, number>` | `undefined` | Per-section length limits (sectioned mode) |
| `.sectionRoles(v)` | `Record<string, "system" \| "user" \| "assistant">` | `undefined` | Section to role mapping (messages mode) |
| `.commandsDir(v)` | `string` | `"./commands"` | Directory for command templates |
| `.subagentsDir(v)` | `string` | `"./.agents"` | Directory for subagent definitions |
| `.parseSubagentFrontmatter(v)` | `boolean` | `false` | Strip YAML frontmatter and set `output.frontmatter` |
| `.customSources(v)` | `SourcePlugin[]` | `undefined` | Custom source plugins |
| `.sqlite(v?)` | `boolean` | `false` | Enable `{{sqlite://path/query:SQL}}` placeholder support |
| `.redis(v)` | `string \| DbPluginOptions` | `undefined` | Configure Redis connection and enable `{{redis://...}}` placeholders |

### Returns (from `.run()`)

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

### Example

```ts
import { shotput } from "shotput";

// One-off: chain config setters and call .run()
const result = await shotput()
  .templateDir("./templates")
  .templateFile("prompt.md")
  .allowedBasePaths(["./data"])
  .allowHttp(true)
  .run();
console.log(result.content);
console.log(`Duration: ${result.metadata.duration}ms`);

// Reusable program: .build() once, chain overrides per call
const base = shotput()
  .templateDir("./templates")
  .allowedBasePaths(["./data"])
  .build();
const out = await base.templateFile("prompt.md").context({ user: "n" }).run();
const { stream } = await base.templateFile("prompt.md").stream();

// Inline template with context
const inlineResult = await shotput()
  .template("Task: {{context.taskName}}\n{{./data.txt}}")
  .templateDir("./data")
  .allowedBasePaths(["./data"])
  .context({ taskName: "review" })
  .run();
console.log(inlineResult.content);
```

## Format utilities

### In-template format references

Use a format prefix to parse and expand the file as structured content in the template (path is relative to the template directory, validated against `allowedBasePaths`):

| Placeholder | Behavior |
|-------------|----------|
| `{{yaml:path/to/file.yaml}}` | Parse YAML and expand as formatted JSON. |
| `{{json:path/to/file.json}}` | Parse JSON and expand as pretty-printed JSON. |
| `{{jsonl:path/to/file.jsonl}}` | Parse JSONL and expand as JSON array. |
| `{{xml:path/to/file.xml}}` | Parse XML and expand as formatted XML string. |
| `{{md:path/to/file.md}}` | Insert file content as-is (no parse). |

### Programmatic helpers

Re-exported for use on resolved content or external data:

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

## `compileShotputTemplate(template, baseConfig?): ShotputProgram`

Pre-compiles a template string and returns a `ShotputProgram`. Use when rendering the same template many times with varying context; the block parse cache is warmed once. Chain config setters (e.g. `.context(...)`) then call `.run()` or `.stream()` to execute.

```ts
const program = compileShotputTemplate(template, { templateDir, allowedBasePaths });
const out1 = await program.context({ user: "alice" }).run();
const out2 = await program.context({ user: "bob" }).run();
```

## `resolveSubagent(config): Promise<ResolvedSubagent>`

Load a subagent definition file (path via `subagentFile`), parse YAML frontmatter, resolve the body as a template, and return `{ systemPrompt, agentConfig, metadata }`. Use with agent frameworks that consume system prompts and config.

## Examples

Comprehensive examples are in [examples/](../examples/):

### Basic

- [01-simple-file.ts](../examples/basic/01-simple-file.ts) - Simple file interpolation
- [02-multiple-files.ts](../examples/basic/02-multiple-files.ts) - Multiple files
- [03-directory.ts](../examples/basic/03-directory.ts) - Directory inclusion
- [04-glob-patterns.ts](../examples/basic/04-glob-patterns.ts) - Glob patterns
- [05-regex-patterns.ts](../examples/basic/05-regex-patterns.ts) - Regex file paths
- [06-http.ts](../examples/basic/06-http.ts) - HTTP URLs
- [07-functions.ts](../examples/basic/07-functions.ts) - Custom JavaScript functions
- [08-skills.ts](../examples/basic/08-skills.ts) - Anthropic Skills
- [09-inline-template.ts](../examples/basic/09-inline-template.ts) - Template strings
- [10-parallel-simple.ts](../examples/basic/10-parallel-simple.ts) - Parallel processing
- [11-rules.ts](../examples/basic/11-rules.ts) - Conditionals (`{{#if}}`)
- [12-hooks.ts](../examples/basic/12-hooks.ts) - Lifecycle hooks
- [13-output-modes.ts](../examples/basic/13-output-modes.ts) - Flat, sectioned, messages
- [14-commands.ts](../examples/basic/14-commands.ts) - Commands
- [15-subagents.ts](../examples/basic/15-subagents.ts) - Subagents
- [16-variables.ts](../examples/basic/16-variables.ts) - Variable substitution
- [17-each.ts](../examples/basic/17-each.ts) - Loops (`{{#each}}`)
- [18-format-markdown.ts](../examples/basic/18-format-markdown.ts) - Markdown to HTML or plaintext
- [19-format-jsonl.ts](../examples/basic/19-format-jsonl.ts) - JSONL parse and streaming
- [20-format-xml.ts](../examples/basic/20-format-xml.ts) - XML parse and S3 list response
- [21-format-references.ts](../examples/basic/21-format-references.ts) - All format references

### Advanced

- [01-s3-basic.ts](../examples/advanced/01-s3-basic.ts) - S3 basics
- [02-s3-directory-buckets.ts](../examples/advanced/02-s3-directory-buckets.ts) - S3 directory buckets
- [03-s3-cloudflare-r2.ts](../examples/advanced/03-s3-cloudflare-r2.ts) - Cloudflare R2
- [04-streaming.ts](../examples/advanced/04-streaming.ts) - Streaming large files
- [05-security.ts](../examples/advanced/05-security.ts) - Security and path validation
- [06-length-limits.ts](../examples/advanced/06-length-limits.ts) - Length limits and truncation
- [07-mixed-sources.ts](../examples/advanced/07-mixed-sources.ts) - Mixed source types
- [08-remote-skills.ts](../examples/advanced/08-remote-skills.ts) - Remote skills
- [09-parallel-processing.ts](../examples/advanced/09-parallel-processing.ts) - Parallel planning and retry
- [10-nested-templates.ts](../examples/advanced/10-nested-templates.ts) - Nested templates
- [11-nested-mixed-sources.ts](../examples/advanced/11-nested-mixed-sources.ts) - Nested mixed sources
- [12-custom-source.ts](../examples/advanced/12-custom-source.ts) - Custom source plugins
- [13-token-budgeting.ts](../examples/advanced/13-token-budgeting.ts) - Token-aware budgeting
- [14-db-sqlite.ts](../examples/advanced/14-db-sqlite.ts) - SQLite database source
- [15-db-redis.ts](../examples/advanced/15-db-redis.ts) - Redis database source
- [16-semantic-compression.ts](../examples/advanced/16-semantic-compression.ts) - Semantic compression
- [17-playbooks.ts](../examples/advanced/17-playbooks.ts) - Playbooks

See the [examples README](../examples/README.md) for complete documentation.
