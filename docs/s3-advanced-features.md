# Advanced S3/R2 Features

This document describes the advanced S3 and R2 storage features available in Shotput, including explicit credential management and AWS S3 directory bucket support.

## Table of Contents

- [Credential Configuration](#credential-configuration)
- [Directory Bucket Support](#directory-bucket-support)
- [Configuration Methods](#configuration-methods)
- [S3-Compatible Services](#s3-compatible-services)
- [Examples](#examples)

## Credential Configuration

Shotput now supports explicit S3/R2 credential configuration beyond just environment variables. You can configure credentials globally or override them per-operation.

### Available Credential Options

| Option | Description | Environment Variable |
|--------|-------------|---------------------|
| `s3AccessKeyId` | AWS access key ID | `S3_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID` |
| `s3SecretAccessKey` | AWS secret access key | `S3_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY` |
| `s3SessionToken` | AWS session token (for temporary credentials) | `S3_SESSION_TOKEN` or `AWS_SESSION_TOKEN` |
| `s3Region` | AWS region | `S3_REGION` or `AWS_REGION` |
| `s3Bucket` | Default bucket name | `S3_BUCKET` or `AWS_BUCKET` |
| `s3VirtualHostedStyle` | Use virtual-hosted-style URLs | `S3_VIRTUAL_HOSTED_STYLE=true` |

### Credential Priority

Shotput uses the following priority order for credentials:

1. Explicitly passed credentials (via `shotput()` config)
2. Environment variables (`.env` file or system)
3. Bun's default credential resolution (follows AWS SDK conventions)

## Directory Bucket Support

Shotput now supports AWS S3 Directory Buckets (S3 Express One Zone), which provide single-digit millisecond latency for high-performance workloads.

### What are Directory Buckets?

Directory buckets are a new type of S3 bucket optimized for high-performance access patterns. They:

- Use a special naming convention: `bucket-name--azid--x-s3`
- Are zone-specific (single Availability Zone)
- Use S3 Express endpoints instead of standard S3 endpoints
- Support bucket names up to 255 characters (vs 63 for standard buckets)

### Directory Bucket Detection

Shotput automatically detects directory buckets by their naming pattern and:

1. Validates the bucket name format
2. Extracts the Availability Zone ID
3. Constructs the appropriate S3 Express endpoint
4. Routes requests to the correct zone-specific endpoint

### Directory Bucket Naming Format

```
bucket-name--azid--x-s3
```

Where:
- `bucket-name`: Your chosen bucket name
- `azid`: Availability Zone ID (e.g., `use1-az4`)
- `--x-s3`: Required suffix

**Example:** `my-data--use1-az4--x-s3`

## Configuration Methods

### 1. Environment Variables

Create a `.env` file in your project root:

```bash
# AWS Credentials
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_REGION=us-east-1

# Optional
S3_SESSION_TOKEN=your-session-token
S3_BUCKET=my-default-bucket
S3_VIRTUAL_HOSTED_STYLE=true

# For Cloudflare R2
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
```

### 2. Programmatic Configuration

```typescript
import { shotput } from "shotput";

const instance = shotput({
  // S3 Credentials
  s3AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  s3SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  s3SessionToken: "optional-session-token",
  s3Region: "us-east-1",
  s3Bucket: "my-default-bucket",
  s3VirtualHostedStyle: false,
  
  // Other options
  templateDir: "./templates",
  templateFile: "template.md",
});

const result = await instance.run();
```

### 3. Per-Operation Credentials (Advanced)

While Shotput uses global credentials by default, the underlying implementation supports per-path credential overrides through the internal API.

## S3-Compatible Services

### AWS S3 (Standard Buckets)

```bash
# .env
S3_REGION=us-west-2
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
```

```markdown
<!-- template.md -->
{{s3://my-bucket/path/to/file.json}}
{{s3://my-bucket/prefix/}}
```

### AWS S3 (Directory Buckets)

```bash
# .env
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
```

```markdown
<!-- template.md -->
<!-- Directory bucket with single file -->
{{s3://my-data--use1-az4--x-s3/file.json}}

<!-- Directory bucket with prefix -->
{{s3://my-data--use1-az4--x-s3/logs/}}
```

**Note:** Shotput automatically detects directory buckets and uses the correct S3 Express endpoint:
```
https://my-data--use1-az4--x-s3.s3express-use1-az4.us-east-1.amazonaws.com
```

### Cloudflare R2

```bash
# .env
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-r2-access-key
S3_SECRET_ACCESS_KEY=your-r2-secret-key
```

```markdown
<!-- template.md -->
{{s3://my-r2-bucket/data.json}}
```

### DigitalOcean Spaces

```bash
# .env
AWS_S3_URL=nyc3.digitaloceanspaces.com
S3_ACCESS_KEY_ID=your-spaces-key
S3_SECRET_ACCESS_KEY=your-spaces-secret
```

### MinIO

```typescript
import { shotput } from "shotput";

const instance = shotput({
  s3AccessKeyId: "minioadmin",
  s3SecretAccessKey: "minioadmin",
  awsS3Url: "localhost:9000",
});
```

### Virtual Hosted-Style URLs

For services that require virtual hosted-style URLs:

```typescript
const instance = shotput({
  s3VirtualHostedStyle: true,
  s3Region: "us-east-1",
  s3Bucket: "my-bucket",
});
```

This changes the URL format from:
- Path-style: `https://s3.us-east-1.amazonaws.com/my-bucket/key`
- To virtual-hosted-style: `https://my-bucket.s3.us-east-1.amazonaws.com/key`

## Complete Working Examples

All examples below are fully functional and can be run directly. Example scripts are available in the [`examples/advanced/`](../examples/advanced/) directory.

### Example 1: Basic S3 File Access

**Template (`template.md`):**
```markdown
# S3 File Example

## Configuration File from S3

{{s3://my-bucket/config/app.json}}

## Logs from S3

{{s3://my-bucket/logs/app.log}}
```

**Script (`01-s3-basic.ts`):**
```typescript
import { shotput } from "shotput";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Setup
const templateDir = "./output/s3-basic";
mkdirSync(templateDir, { recursive: true });

// Create template
const template = `# S3 File Example

## Configuration File from S3

{{s3://my-bucket/config/app.json}}

## Logs from S3

{{s3://my-bucket/logs/app.log}}
`;

writeFileSync(join(templateDir, "template.md"), template);

// Process with Shotput
const instance = shotput({
  templateDir,
  templateFile: "template.md",
  responseDir: templateDir,
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3Region: process.env["S3_REGION"] || "us-east-1",
});

const result = await instance.run();
console.log("✅ Success! Content length:", result.metadata.totalLength);
```

**Run:**
```bash
export S3_ACCESS_KEY_ID="your-key"
export S3_SECRET_ACCESS_KEY="your-secret"
export S3_REGION="us-east-1"
bun run examples/advanced/01-s3-basic.ts
```

### Example 2: S3 Prefix (Directory) Listing

**Template:**
```markdown
# Application Logs

All log files from the logs prefix:

{{s3://my-bucket/logs/2024/01/}}
```

**Script:**
```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  responseDir: "./output",
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3Region: "us-east-1",
  maxBucketFiles: 50, // Limit number of files from prefix
});

const result = await instance.run();

// Show what files were included
result.metadata.processedTemplates.forEach(tpl => {
  if (tpl.type === "s3") {
    console.log(`Included: ${tpl.path} (${tpl.length} bytes)`);
  }
});
```

### Example 3: Using Temporary Credentials (AWS STS)

**Environment setup:**
```bash
# Assume role and get temporary credentials
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/MyRole --role-session-name mysession

# Export the temporary credentials
export S3_ACCESS_KEY_ID="ASIA..."
export S3_SECRET_ACCESS_KEY="..."
export S3_SESSION_TOKEN="IQoJb3JpZ2luX2..."
```

**Script:**
```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  responseDir: "./output",
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3SessionToken: process.env.S3_SESSION_TOKEN, // Required for temporary creds
  s3Region: "us-east-1",
});

const result = await instance.run();
```

### Example 4: Multi-Region Setup

**Template:**
```markdown
# Multi-Region Data

## US East Configuration
{{s3://us-east-1-bucket/config.json}}

## US West Data
{{s3://us-west-2-bucket/data.json}}

## EU Configuration
{{s3://eu-west-1-bucket/config.json}}
```

**Script:**
```typescript
const instance = shotput({
  templateDir: "./templates",
  templateFile: "multi-region.md",
  s3Region: "us-east-1", // Primary region
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
});

// Shotput automatically detects bucket regions from bucket names
const result = await instance.run();
```

### Example 5: Directory Bucket for High-Performance Logs

Directory buckets (S3 Express One Zone) provide single-digit millisecond latency.

**Environment:**
```bash
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
```

**Template:**
```markdown
# Recent Application Logs

## Today's Logs (from Directory Bucket)
{{s3://app-logs--use1-az4--x-s3/2024/01/20/}}

## Metrics (from Standard Bucket)
{{s3://app-metrics/2024/01/20/metrics.json}}
```

**Script:**
```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "logs.md",
  responseDir: "./output",
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3Region: "us-east-1",
});

const result = await instance.run();

// Shotput automatically:
// 1. Detects directory bucket format (--azid--x-s3 pattern)
// 2. Extracts Availability Zone ID (use1-az4)
// 3. Constructs S3 Express endpoint
// 4. Uses optimal performance settings
```

**What Shotput Does Automatically:**
1. Detects the directory bucket format: `app-logs--use1-az4--x-s3`
2. Extracts the Availability Zone ID: `use1-az4`
3. Constructs the S3 Express endpoint: `https://app-logs--use1-az4--x-s3.s3express-use1-az4.us-east-1.amazonaws.com`
4. Lists and fetches all files in the `2024/01/20/` prefix
5. Falls back to standard S3 for regular buckets

### Example 6: Cloudflare R2 Storage

**Environment:**
```bash
CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-r2-access-key
S3_SECRET_ACCESS_KEY=your-r2-secret-key
```

**Template:**
```markdown
# R2 Data

## Cached Data
{{s3://my-r2-bucket/cache/data.json}}

## User Uploads
{{s3://my-r2-bucket/uploads/}}
```

**Script:**
```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "r2.md",
  responseDir: "./output",
  cloudflareR2Url: process.env["CLOUDFLARE_R2_URL"],
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
});

const result = await instance.run();
```

**Creating R2 Credentials:**
```bash
# In Cloudflare dashboard:
# 1. Go to R2
# 2. Create API Token
# 3. Set permissions (read/write as needed)
# 4. Copy Access Key ID and Secret Access Key
```

### Example 7: Security Configuration

**Script:**
```typescript
import { shotput } from "shotput";

const instance = shotput({
  templateDir: "./templates",
  templateFile: "template.md",
  responseDir: "./output",
  
  // S3 credentials
  s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
  s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
  s3Region: "us-east-1",
  
  // Security settings
  allowedBasePaths: ["/app/templates", "/app/data"],
  maxPromptLength: 50000,      // Max 50KB output
  maxBucketFiles: 100,          // Max 100 files from S3 prefix
  
  // Debugging
  debug: true,
  debugFile: "./output/debug.json",
});

const result = await instance.run();

// Check for truncation
if (result.metadata.truncated) {
  console.warn("⚠️ Output was truncated due to length limits");
}

// Check for errors
if (result.metadata.errors.length > 0) {
  console.error("❌ Errors encountered:");
  result.metadata.errors.forEach(err => {
    console.error(`  - ${err.path}: ${err.error}`);
  });
}
```

### Example 8: Complete Production Setup

**Full example with error handling, logging, and best practices:**

```typescript
import { shotput } from "shotput";
import { writeFileSync } from "fs";

async function processS3Template() {
  // Validate environment
  const requiredEnvVars = [
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_REGION"
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
  
  // Configure instance
  const instance = shotput({
    templateDir: "./templates",
    templateFile: "production.md",
    responseDir: "./output",
    
    // S3 Configuration
    s3AccessKeyId: process.env["S3_ACCESS_KEY_ID"],
    s3SecretAccessKey: process.env["S3_SECRET_ACCESS_KEY"],
    s3SessionToken: process.env.S3_SESSION_TOKEN, // Optional
    s3Region: process.env["S3_REGION"],
    
    // R2 Support (optional)
    cloudflareR2Url: process.env["CLOUDFLARE_R2_URL"],
    
    // Security
    allowedBasePaths: [process.cwd()],
    allowHttp: true,
    allowFunctions: false,
    
    // Limits
    maxPromptLength: 200000,  // 200KB
    maxBucketFiles: 500,      // Max files from S3 prefix
    
    // Debugging
    debug: process.env.DEBUG === "true",
    debugFile: "./output/debug.json",
  });
  
  try {
    console.log("🚀 Processing template with S3 resources...");
    const startTime = Date.now();
    
    const result = await instance.run();
    
    const duration = Date.now() - startTime;
    
    // Log results
    console.log("\n✅ Processing complete!");
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Templates processed: ${result.metadata.processedTemplates.length}`);
    console.log(`📏 Total length: ${result.metadata.totalLength} bytes`);
    console.log(`✂️  Truncated: ${result.metadata.truncated ? "Yes" : "No"}`);
    
    // Log S3-specific info
    const s3Templates = result.metadata.processedTemplates.filter(
      t => t.type === "s3"
    );
    
    if (s3Templates.length > 0) {
      console.log(`\n☁️  S3 resources fetched: ${s3Templates.length}`);
      s3Templates.forEach(tpl => {
        console.log(`   - ${tpl.path} (${tpl.length} bytes, ${tpl.processingTime}ms)`);
      });
    }
    
    // Log errors
    if (result.metadata.errors.length > 0) {
      console.error(`\n❌ Errors: ${result.metadata.errors.length}`);
      result.metadata.errors.forEach(err => {
        console.error(`   - ${err.path}: ${err.error}`);
      });
    }
    
    // Save metadata
    writeFileSync(
      "./output/metadata.json",
      JSON.stringify(result.metadata, null, 2)
    );
    
    return result;
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    throw error;
  }
}

// Run
processS3Template()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
  
  });
```

**Template (`production.md`):**
```markdown
# Production Configuration

## Application Configuration
{{s3://prod-config-bucket/app/config.json}}

## Feature Flags
{{s3://prod-config-bucket/features/flags.json}}

## Recent Logs (Directory Bucket for Performance)
{{s3://prod-logs--use1-az4--x-s3/2024/01/20/}}

## Metrics Archive (Standard Bucket)
{{s3://prod-metrics-bucket/daily/2024-01-20.json}}

## Documentation (R2)
{{s3://docs-r2-bucket/current/README.md}}
```

## Security Considerations

### Credential Storage

- **Never commit credentials to version control**
- Use environment variables or secret management services
- Rotate credentials regularly
- Use temporary credentials (session tokens) when possible

### Bucket Name Validation

Shotput validates both standard and directory bucket names:

**Standard buckets:**
- 3-63 characters
- Lowercase alphanumeric and hyphens
- Cannot start or end with hyphen

**Directory buckets:**
- 3-255 characters
- Must match pattern: `bucket-name--azid--x-s3`
- Availability Zone ID format validated

### Path Traversal Protection

Shotput automatically blocks:
- Relative path traversal (`../`, `..\\`)
- Invalid S3 key patterns
- Malformed bucket names

## Troubleshooting

### Directory Bucket Not Working

If directory bucket access fails:

1. Verify the bucket name format: `name--azid--x-s3`
2. Ensure you have the correct region configured
3. Check that your IAM permissions include S3 Express
4. Verify the Availability Zone ID is correct

### Credentials Not Found

If you see credential errors:

1. Check environment variables are set
2. Verify `.env` file is in the correct location
3. Ensure Bun is loading the `.env` file
4. Try explicit credential configuration

### Endpoint Issues

If you're getting connection errors:

1. Verify `awsS3Url` or `cloudflareR2Url` is correct
2. For directory buckets, ensure region matches the AZ
3. Check network connectivity and firewall rules
4. Verify the endpoint format for your storage provider

## API Reference

### S3Credentials Interface

```typescript
interface S3Credentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  virtualHostedStyle?: boolean;
}
```

### S3BucketInfo Interface

```typescript
interface S3BucketInfo {
  bucket: string;
  key?: string;
  isDirectoryBucket: boolean;
  availabilityZoneId?: string;
}
```

## Performance Tips

1. **Use Directory Buckets** for latency-sensitive workloads (single-digit millisecond access)
2. **Set maxBucketFiles** to limit the number of files fetched from prefix listings
3. **Use specific prefixes** instead of listing entire buckets
4. **Configure maxPromptLength** to prevent memory issues with large files
5. **Use regional endpoints** to minimize latency

## Related Documentation

- [Bun S3 API Documentation](https://bun.sh/docs/api/s3)
- [AWS S3 Directory Buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-buckets-overview.html)
- [Shotput Security](../README.md#security)
- [Configuration Reference](../src/config.ts)