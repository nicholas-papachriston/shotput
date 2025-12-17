# Shotput

Zero dependency plug-and-play templating for Bun

## Motivation

Shotput is a simple, programmatic templating library to help manage personas, system prompts, and other text-based configurations for use in any project but particularly for Gen AI applications

## Features

- arbitrary source retrieval
- arbitrary output destination
- streaming for large files (>1MB)
- security validation for all paths
- templating with:
  - file paths
  - directory paths
  - functions (cjs/esm)
  - http paths
  - glob patterns
  - s3 paths with advanced credential support ([docs](./docs/s3-advanced-features.md))
  - s3 directory buckets (AWS S3 Express One Zone) ([docs](./docs/s3-advanced-features.md))
  - regex patterns
  - [Anthropic Skills](https://github.com/anthropics/skills)

## TODO

- npm package
- nested documents
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
| `MAX_PROMPT_LENGTH` | `number` | `100000` | Maximum output length in characters |
| `MAX_BUCKET_FILES` | `number` | `100000` | Maximum files from S3 prefix |
| `MAX_CONCURRENCY` | `number` | `4` | Maximum concurrent operations |
| `MAX_RETRIES` | `number` | `3` | Maximum retry attempts for failed operations |
| `RETRY_DELAY` | `number` | `1000` | Initial retry delay in milliseconds |
| `RETRY_BACKOFF_MULTIPLIER` | `number` | `2` | Exponential backoff multiplier for retries |
| `ENABLE_CONTENT_LENGTH_PLANNING` | `boolean` | `true` | Enable planning phase with content length detection |

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

### Inline Template Content

Instead of reading templates from files, you can pass template content directly as a string:

```ts
import { shotput } from "shotput";

// Simple inline template
const instance = shotput({
  template: 'Hello {{./data.txt}}!',
  templateDir: '/path/to/base',  // used for resolving relative paths
  allowedBasePaths: ['/path/to/base']
});

const result = await instance.run();
console.log(result.content);

// Dynamically generated template
const timestamp = new Date().toISOString();
const dynamicTemplate = `# Report\nGenerated: ${timestamp}\n{{./config.json}}`;

const dynamicInstance = shotput({
  template: dynamicTemplate,
  templateDir: './data',
  allowedBasePaths: ['./data']
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
import { shotput } from "shotput";

const instance = shotput({
  skillsDir: "./skills",           // local skills directory
  allowRemoteSkills: false,        // enable GitHub skill loading
  allowedSkillSources: ["anthropics/skills"],  // allowed remote sources
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
import { shotput } from "shotput";

const instance = shotput({
  s3AccessKeyId: "your-access-key",
  s3SecretAccessKey: "your-secret-key",
  s3Region: "us-east-1",
  // Optional
  s3SessionToken: "session-token",  // for temporary credentials
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
import { shotput } from "shotput";

const instance = shotput({
  maxConcurrency: 4,                    // Process 4 templates concurrently
  enableContentLengthPlanning: true,    // Enable planning phase
  maxRetries: 3,                        // Retry up to 3 times on failure
  retryDelay: 1000,                     // Initial delay: 1 second
  retryBackoffMultiplier: 2,            // Double delay each retry (1s → 2s → 4s)
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

**Disabling Parallel Processing:**

For debugging or specific use cases, disable parallel processing:

```ts
const instance = shotput({
  enableContentLengthPlanning: false,  // Use sequential processing
  maxConcurrency: 1,                   // Process one at a time
});
```

## API

### `shotput(config?: Partial<ShotputConfig>): ShotputInstance`

Creates a new Shotput instance with optional configuration overrides.

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
| `enableContentLengthPlanning` | `boolean` | `true` | Enable planning phase with content length detection |

**Returns:**

`ShotputInstance` object with a `run()` method.

### `instance.run(): Promise<ShotputResult>`

Processes the template and returns the result.

**Returns:**

```ts
interface ShotputResult {
  content: string;  // Processed template content
  metadata: {
    processedTemplates: TemplateResult[];  // Details for each template
    totalLength: number;                   // Total output length
    truncated: boolean;                    // Whether content was truncated
    errors: ProcessingError[];             // Any errors encountered
    processingTime: number;                // Total processing time in ms
  };
}

interface TemplateResult {
  type: TemplateType;        // e.g., "file", "s3", "http", "function"
  path: string;              // Source path or URL
  length: number;            // Content length in characters
  truncated: boolean;        // Whether this template was truncated
  processingTime: number;    // Processing time in ms
  content?: string;          // Optional: actual content
  error?: string;            // Optional: error message if failed
}

interface ProcessingError {
  path: string;              // Source that failed
  error: string;             // Error message
  type: TemplateType;        // Type of template that failed
}
```

**Example:**

```ts
import { shotput } from "shotput";

// File-based template
const instance = shotput({
  templateDir: "./templates",
  templateFile: "prompt.md",
  allowedBasePaths: ["./data"],
  allowHttp: true
});

const result = await instance.run();

// Access the processed content
console.log(result.content);

// Check metadata
console.log(`Processed ${result.metadata.processedTemplates.length} templates`);
console.log(`Total length: ${result.metadata.totalLength} characters`);
console.log(`Processing time: ${result.metadata.processingTime}ms`);

// Check for errors
if (result.metadata.errors.length > 0) {
  console.error("Errors encountered:");
  result.metadata.errors.forEach(err => {
    console.error(`  ${err.path}: ${err.error}`);
  });
}

// Inline template
const inlineInstance = shotput({
  template: "Hello {{./data.txt}}!",
  templateDir: "./data",
  allowedBasePaths: ["./data"]
});

const inlineResult = await inlineInstance.run();
console.log(inlineResult.content);
```

## Examples

Comprehensive examples demonstrating all features are available in the [`examples/`](./examples/) directory:

### Basic Examples

- **[01-simple-file.ts](./examples/basic/01-simple-file.ts)** - Simple file interpolation
- **[02-multiple-files.ts](./examples/basic/02-multiple-files.ts)** - Including multiple files
- **[03-directory.ts](./examples/basic/03-directory.ts)** - Directory inclusion
- **[04-glob-patterns.ts](./examples/basic/04-glob-patterns.ts)** - Using glob patterns to match files
- **[05-regex-patterns.ts](./examples/basic/05-regex-patterns.ts)** - Using regex to match file paths
- **[06-http.ts](./examples/basic/06-http.ts)** - Fetching content from HTTP URLs
- **[07-functions.ts](./examples/basic/07-functions.ts)** - Using custom JavaScript functions
- **[08-skills.ts](./examples/basic/08-skills.ts)** - Loading Anthropic Skills
- **[09-inline-template.ts](./examples/basic/09-inline-template.ts)** - Using template strings instead of files
- **[10-parallel-simple.ts](./examples/basic/10-parallel-simple.ts)** - Simple parallel processing

### Advanced Examples

- **[10-parallel-processing.ts](./examples/advanced/10-parallel-processing.ts)** - Advanced parallel processing with planning, retry logic, and performance comparison

### Running Examples

```bash
# Run a single example
bun run examples/basic/01-simple-file.ts

# Run all basic examples
for file in examples/basic/*.ts; do bun run "$file"; done
```

Each example includes:
- Clear documentation and comments
- Step-by-step explanations
- Expected output
- Key takeaways and best practices

See the [examples README](./examples/README.md) for complete documentation.

## Prerequisites for Local Use

- `bun`
