# Environment Variables

Shotput can be configured via environment variables. All configuration options can be set either through environment variables or programmatically in code.

See the project root [env.example](../env.example) for a complete `.env` reference.

## Core Configuration

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

## Security Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALLOWED_BASE_PATHS` | `string` | `process.cwd()` | Comma-separated allowed base paths |
| `ALLOW_HTTP` | `boolean` | `true` | Allow HTTP/HTTPS requests |
| `ALLOWED_DOMAINS` | `string` | - | Comma-separated allowed HTTP domains |
| `HTTP_TIMEOUT` | `number` | `30000` | HTTP timeout in milliseconds |
| `HTTP_STREAM_THRESHOLD_BYTES` | `number` | `1048576` | Byte threshold above which HTTP responses stream |
| `ALLOW_FUNCTIONS` | `boolean` | `false` | Allow custom function execution |
| `ALLOWED_FUNCTION_PATHS` | `string` | - | Comma-separated allowed function paths |

## Skills Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SKILLS_DIR` | `string` | `"./skills"` | Local skills directory |
| `ALLOW_REMOTE_SKILLS` | `boolean` | `false` | Allow loading skills from GitHub |
| `ALLOWED_SKILL_SOURCES` | `string` | `"anthropics/skills"` | Comma-separated allowed remote sources |

## Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_URL` or `VALKEY_URL` | `string` | - | Redis connection URL (enables `{{redis://...}}` placeholders) |
| `SQLITE_ENABLED` | `boolean` | `false` | Enable `{{sqlite://...}}` placeholder support |

## S3/R2 Configuration

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
