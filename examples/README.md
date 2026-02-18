# Shotput Examples

This directory contains comprehensive examples demonstrating all features of Shotput. Each example is self-contained and runnable.

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd shotput

# Install dependencies (if any)
bun install

# Run any example
bun run examples/basic/01-simple-file.ts
```

### Setting Up S3 Buckets (For Advanced Examples)

Some advanced examples require S3 buckets with sample data. Use the setup scripts to create them:

```bash
# Set AWS credentials
export S3_ACCESS_KEY_ID=your-key
export S3_SECRET_ACCESS_KEY=your-secret
export S3_REGION=us-east-1

# Run setup script
bun run examples/setup-s3-buckets.ts
```

See [SETUP.md](./SETUP.md) for detailed instructions.

## Examples Index

### Basic Examples

These examples demonstrate fundamental features:

1. **[Simple File Interpolation](./basic/01-simple-file.ts)** - Basic file inclusion
2. **[Multiple Files](./basic/02-multiple-files.ts)** - Including multiple files in one template
3. **[Directory Inclusion](./basic/03-directory.ts)** - Including all files from a directory
4. **[Glob Patterns](./basic/04-glob-patterns.ts)** - Using glob patterns to match files
5. **[Regex Patterns](./basic/05-regex-patterns.ts)** - Using regex to match file paths
6. **[HTTP Resources](./basic/06-http.ts)** - Fetching content from HTTP URLs
7. **[Custom Functions](./basic/07-functions.ts)** - Using custom JavaScript functions
8. **[Anthropic Skills](./basic/08-skills.ts)** - Loading Anthropic Skills format
9. **[Inline Template Content](./basic/09-inline-template.ts)** - Using template strings instead of files
10. **[Parallel Simple](./basic/10-parallel-simple.ts)** - Basic parallel processing
11. **[Rules (Conditional Inclusion)](./basic/11-rules.ts)** - `{{#if}}...{{else}}...{{/if}}` and `context`
12. **[Hooks](./basic/12-hooks.ts)** - preResolve, postResolveSource, postAssembly, preOutput
13. **[Output Modes](./basic/13-output-modes.ts)** - Sectioned and messages output with `{{#section:name}}`
14. **[Commands](./basic/14-commands.ts)** - `{{command:name key=value}}` and `{{$param}}`
15. **[Subagents](./basic/15-subagents.ts)** - `resolveSubagent()`, `{{subagent:name}}`, `parseSubagentFrontmatter`

### Advanced Examples

These examples demonstrate advanced features and patterns:

1. **[S3 Integration](./advanced/01-s3-basic.ts)** - Basic S3 file and prefix access
2. **[S3 Directory Buckets](./advanced/02-s3-directory-buckets.ts)** - AWS S3 Express One Zone
3. **[S3 with R2](./advanced/03-s3-cloudflare-r2.ts)** - Using Cloudflare R2
4. **[Large File Streaming](./advanced/04-streaming.ts)** - Handling files >1MB
5. **[Security Configuration](./advanced/05-security.ts)** - Path validation and restrictions
6. **[Length Limits](./advanced/06-length-limits.ts)** - Managing output size
7. **[Mixed Sources](./advanced/07-mixed-sources.ts)** - Combining multiple source types
8. **[Remote Skills](./advanced/08-remote-skills.ts)** - Loading skills from GitHub
9. **[Parallel Processing](./advanced/09-parallel-processing.ts)** - Advanced concurrency features
10. **[Nested Templates](./advanced/10-nested-templates.ts)** - Recursive template interpolation
11. **[Nested Mixed Sources](./advanced/11-nested-mixed-sources.ts)** - File, skill, function, HTTP chain
12. **[Custom Source Plugin](./advanced/12-custom-source.ts)** - `customSources` and `SourcePlugin`

## Feature Matrix

| Feature | Basic Example | Advanced Example | Template Syntax |
|---------|--------------|------------------|-----------------|
| File paths | 01 | - | `{{/path/to/file.txt}}` |
| Directory paths | 03 | - | `{{/path/to/dir/}}` |
| Relative paths | 01 | - | `{{./relative/path.txt}}` |
| Glob patterns | 04 | 07 | `{{/path/**/*.ts}}` |
| Regex patterns | 05 | - | `{{\regex\/g}}` |
| HTTP/HTTPS | 06 | - | `{{http://example.com/data}}` |
| S3 files | - | 01 | `{{s3://bucket/file.json}}` |
| S3 prefixes | - | 01 | `{{s3://bucket/prefix/}}` |
| S3 directory buckets | - | 02 | `{{s3://name--az--x-s3/file}}` |
| Cloudflare R2 | - | 03 | `{{s3://bucket/file}}` |
| Nested templates | - | 10 | `{{./file-with-markers.txt}}` |
| Custom functions | 07 | - | `{{TemplateType.Function:/path/fn.js}}` |
| Local skills | 08 | - | `{{skill:skill-name}}` |
| Remote skills | - | 08 | `{{skill:github:org/repo/skill}}` |
| Streaming | - | 04 | Automatic for files >1MB |
| Security | - | 05 | Configuration-based |
| Rules (conditionals) | 11 | - | `{{#if context.x}}...{{else}}...{{/if}}` |
| Hooks | 12 | - | preResolve, postResolveSource, postAssembly, preOutput |
| Output modes (sectioned/messages) | 13 | - | `{{#section:name}}...{{/section}}`, outputMode config |
| Commands | 14 | - | `{{command:name key=val}}`, `{{$param}}` |
| Subagents | 15 | - | `{{subagent:name}}`, resolveSubagent(), parseSubagentFrontmatter |
| Custom source plugin | - | 12 | `customSources: [SourcePlugin]` |

## Template Syntax Reference

### File Inclusion

```markdown
# Absolute path
{{/absolute/path/to/file.txt}}

# Relative path (from template directory)
{{./relative/file.txt}}
{{../parent/file.txt}}

# Multiple files in order
{{./file1.txt}}
{{./file2.txt}}
```

### Directory Inclusion

```markdown
# Include all files in directory
{{/path/to/directory/}}

# Directory paths must end with /
{{./data/}}
```

### Glob Patterns

```markdown
# All TypeScript files
{{/project/**/*.ts}}

# Specific pattern
{{./src/components/*.tsx}}

# Multiple patterns
{{./src/**/*.{ts,js}}}
```

### Regex Patterns

```markdown
# Match file paths with regex
{{\regex\/g}}

# Example: all test files
{{\.test\.ts$}}
```

### HTTP Resources

```markdown
# HTTP or HTTPS
{{http://api.example.com/config.json}}
{{https://example.com/data.txt}}
```

### S3 Resources

```markdown
# Standard S3 bucket - single file
{{s3://my-bucket/path/to/file.json}}

# Standard S3 bucket - prefix (directory)
{{s3://my-bucket/logs/2024/}}

# Directory bucket (S3 Express)
{{s3://data--use1-az4--x-s3/file.json}}
{{s3://logs--usw2-az1--x-s3/app/}}

# Cloudflare R2 (when configured)
{{s3://r2-bucket/data.json}}
```

### Custom Functions

```markdown
# ES Module or CommonJS
{{TemplateType.Function:/path/to/function.js}}
{{TemplateType.Function:./utils/transform.js}}
```

Function signature:
```javascript
export default async function(result, path, match, remainingLength) {
  const content = "generated content";
  return {
    operationResults: result.replace(match, content),
    combinedRemainingCount: remainingLength - content.length,
  };
}
```

### Anthropic Skills

```markdown
# Local skill (basic)
{{skill:skill-name}}

# Local skill with references
{{skill:skill-name:full}}

# Remote skill from GitHub (requires allowRemoteSkills: true)
{{skill:github:anthropics/skills/brand-guidelines}}
```

## Configuration Examples

### Basic Configuration

```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  responseDir: "./output",
});

const result = await instance.run();
console.log(result.content);
```

### With Security

```typescript
const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  allowedBasePaths: ["/app/data", "/app/templates"],
  allowHttp: true,
  allowFunctions: true,
  allowedFunctionPaths: ["/app/functions"],
});
```

### With S3

```typescript
const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3Region: "us-east-1",
});
```

### With Length Limits

```typescript
const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  maxPromptLength: 50000,  // 50KB max output
  maxBucketFiles: 100,     // Max files from S3 prefix
});
```

### With Skills

```typescript
const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  skillsDir: "./skills",
  allowRemoteSkills: true,
  allowedSkillSources: ["anthropics/skills", "myorg/skills"],
});
```

## Sample Data

The `data/` directory contains sample files used by the examples:

- `data/config.json` - Sample JSON configuration
- `data/users.csv` - Sample CSV data
- `data/article.md` - Sample markdown content
- `data/logs/` - Sample log files
- `data/code/` - Sample source code

## Running Examples

### Prerequisites

```bash
# Ensure Bun is installed
bun --version

# Set up environment variables (for S3/HTTP examples)
cp .env.example .env
# Edit .env with your credentials
```

### Run a Single Example

```bash
bun run examples/basic/01-simple-file.ts
```

### Run All Basic Examples

```bash
for file in examples/basic/*.ts; do
  echo "Running $file..."
  bun run "$file"
done
```

### Run with Custom Configuration

```bash
# Set environment variables
export DEBUG=true
export MAX_PROMPT_LENGTH=100000

bun run examples/advanced/06-length-limits.ts
```

## Environment Variables

Examples may use the following environment variables:

```bash
# S3/AWS Configuration
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=us-east-1
S3_BUCKET=default-bucket

# Cloudflare R2
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com

# Debug Options
DEBUG=false
DEBUG_FILE=./output/debug.json

# Limits
MAX_PROMPT_LENGTH=200000
MAX_BUCKET_FILES=100
```

## Troubleshooting

### "File not found" errors

Ensure you're running examples from the correct directory:

```bash
# Run from project root
cd shotput
bun run examples/basic/01-simple-file.ts
```

### S3 credential errors

1. Check environment variables are set
2. Verify credentials have correct permissions
3. Ensure region matches bucket location

### Security validation errors

Security features prevent path traversal:

```typescript
// ❌ Will fail
{{../../../etc/passwd}}

// ✅ Will succeed (if in allowedBasePaths)
{{/app/data/file.txt}}
```

## Contributing Examples

When adding new examples:

1. Create a descriptive filename (e.g., `09-new-feature.ts`)
2. Include comments explaining each step
3. Use sample data from `data/` directory
4. Update this README with the new example
5. Test the example works standalone

## Additional Resources

- [Main Documentation](../README.md)
- [Environment Variables](../README.md#environment-variables)
- [S3 Advanced Features](../docs/s3-advanced-features.md)
- [Security Best Practices](../docs/security.md)
- [API Reference](../src/config.ts)

## License

See [LICENSE](../LICENSE) for details.