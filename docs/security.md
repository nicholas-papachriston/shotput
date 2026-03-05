# Security Best Practices

This document outlines security considerations and best practices when using Shotput for template processing.

## Table of Contents

- [Overview](#overview)
- [Security Model](#security-model)
- [File System Security](#file-system-security)
- [HTTP Security](#http-security)
- [Function Execution Security](#function-execution-security)
- [S3/R2 Security](#s3r2-security)
- [Database Security](#database-security)
- [Skills Security](#skills-security)
- [Production Configuration](#production-configuration)
- [Security Checklist](#security-checklist)
- [Common Vulnerabilities](#common-vulnerabilities)
- [Additional Resources](#additional-resources)

## Overview

Shotput processes templates that can include content from various sources: local files, HTTP endpoints, S3/R2 buckets, and custom functions. Each source type presents different security considerations.

**Key Security Principles:**

1. **Principle of Least Privilege** - Only enable features you actually need
2. **Defense in Depth** - Use multiple layers of security controls
3. **Explicit Allow Lists** - Default to denying access, explicitly allow what's needed
4. **Input Validation** - Validate and sanitize all external inputs
5. **Secure Defaults** - Conservative defaults that prioritize security

## Security Model

Shotput's security model is based on explicit allowlists for all resource access:

```typescript
import { shotput } from "shotput";

const result = await shotput()
  // Only allow file access within these directories
  .allowedBasePaths(["./data", "./templates"])
  // Only allow HTTP requests to these domains
  .allowHttp(true)
  .allowedDomains(["api.github.com"])
  // Only allow function execution from these paths
  .allowFunctions(true)
  .allowedFunctionPaths(["./functions"])
  // Only allow remote skills from these sources
  .allowRemoteSkills(true)
  .allowedSkillSources(["anthropics/skills"])
  .run();
```

**Default Security Posture:**

- File access limited to `process.cwd()`
- HTTP allowed but can be restricted by domain
- Function execution disabled by default
- Remote skills disabled by default

## File System Security

### Path Traversal Protection

Shotput automatically prevents path traversal attacks:

```markdown
<!-- These will be blocked -->
{{../../../etc/passwd}}
{{/etc/shadow}}
{{~/.ssh/id_rsa}}
{{C:/Windows/System32/config/SAM}}
```

All file paths are resolved and validated against `allowedBasePaths`.

### Best Practices

**1. Set Explicit Allowed Paths**

```typescript
// BAD: Too permissive
allowedBasePaths: ["/"]

// GOOD: Specific directories only
allowedBasePaths: ["./data", "./templates", "./config"]
```

**2. Use Absolute Paths in Configuration**

```typescript
import { resolve } from "node:path";

// GOOD: Absolute paths are clear
allowedBasePaths: [
  resolve("./data"),
  resolve("./templates")
]
```

**3. Separate User Content from System Files**

```typescript
// GOOD: Clear separation
allowedBasePaths: [
  "/app/user-data",      // User-provided content
  "/app/templates",      // System templates
  "/app/configs",        // Configuration files
]
```

**4. Monitor File Access**

Enable debug mode during development to monitor what files are being accessed:

```typescript
shotput()
  .debug(true)
  .debugFile("./logs/file-access.log")
  // ...other config
```

### Symlink Security

Shotput follows symlinks, which can bypass path restrictions:

```bash
# Potential security issue
ln -s /etc/passwd ./data/passwd

# Template can now access /etc/passwd via symlink
{{./data/passwd}}
```

**Mitigation:**

- Disable symlink following in your file system configuration
- Regularly audit directories for unexpected symlinks
- Use read-only mounts where possible

## HTTP Security

### Domain Whitelisting

Always restrict HTTP access to specific domains:

```typescript
// BAD: Allows any domain
shotput().allowHttp(true).allowedDomains([])  // Empty = all allowed

// GOOD: Explicit allowlist
shotput()
  .allowHttp(true)
  .allowedDomains(["api.github.com", "api.example.com"])
```

### Request Timeouts

Set appropriate timeouts to prevent resource exhaustion:

```typescript
shotput()
  .httpTimeout(10000)       // 10 seconds
  .maxPromptLength(100000)  // Limit total response size
```

### Server-Side Request Forgery (SSRF)

Shotput can be used to make HTTP requests. Prevent SSRF attacks:

```typescript
// BAD: Can access internal services
shotput().allowHttp(true).allowedDomains([])

// GOOD: Explicit external-only allowlist
// Do NOT allow: localhost, 127.0.0.1, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12
shotput()
  .allowHttp(true)
  .allowedDomains(["api.external-service.com"])
```

**Additional Protection:**

1. Run Shotput in a network-isolated environment
2. Use firewall rules to block internal network access
3. Validate domains against both DNS name and resolved IP

## Function Execution Security

Function execution is the highest-risk feature and should be used with extreme caution.

### Disable in Production

```typescript
// PRODUCTION: Disable functions (default)
shotput().allowFunctions(false)

// DEVELOPMENT ONLY: Enable with strict path controls
shotput()
  .allowFunctions(true)
  .allowedFunctionPaths(["./safe-functions"])
```

### Function Sandboxing

Functions execute in the same process as Shotput with full permissions:

```javascript
// This function has full system access
export default async function(result, path, match, remainingLength) {
  // Can do ANYTHING, including:
  // - File system access
  // - Network requests
  // - Process execution
  // - Environment variable access
  
  return {
    operationResults: result.replace(match, "content"),
    combinedRemainingCount: remainingLength - 10,
  };
}
```

### Best Practices

**1. Never Allow User-Provided Functions**

```typescript
// NEVER do this
const userFunctionPath = req.body.functionPath;  // User input
{{TemplateType.Function:${userFunctionPath}}}
```

**2. Code Review All Functions**

- Review all custom functions before deployment
- Use static analysis tools
- Test in isolated environments

**3. Use Allowlist for Function Paths**

```typescript
shotput()
  .allowFunctions(true)
  .allowedFunctionPaths([
    "./functions/safe",      // Only pre-approved functions
    "./functions/validated",
  ])
```

**4. Consider Alternatives**

Before enabling function execution, consider:

- Can this be done with template logic?
- Can this be pre-processed?
- Can this use a safer data transformation approach?

## S3/R2 Security

### Credential Management

**Never hardcode credentials:**

```typescript
// BAD: Hardcoded credentials
shotput()
  .s3AccessKeyId("AKIAIOSFODNN7EXAMPLE")
  .s3SecretAccessKey("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")

// GOOD: Use environment variables
shotput()
  .s3AccessKeyId(process.env["S3_ACCESS_KEY_ID"] ?? "")
  .s3SecretAccessKey(process.env["S3_SECRET_ACCESS_KEY"] ?? "")
```

**Use IAM roles when possible:**

```typescript
// BEST: Use IAM roles (no credentials needed)
// Configure IAM role for your EC2/ECS/Lambda - credentials loaded automatically
shotput().s3Region("us-east-1")
```

### Bucket Access Control

**1. Least Privilege IAM Policies**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket/templates/*",
        "arn:aws:s3:::my-bucket/data/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket"
      ],
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "templates/*",
            "data/*"
          ]
        }
      }
    }
  ]
}
```

**2. Limit Bucket File Count**

```typescript
shotput().maxBucketFiles(50)  // Prevent processing thousands of files
```

**3. Use VPC Endpoints**

For AWS S3, use VPC endpoints to prevent traffic from leaving your network:

```typescript
shotput().awsS3Url("bucket.vpce-1234567-abcdefg.s3.us-east-1.vpce.amazonaws.com")
```

### Temporary Credentials

Use temporary credentials with session tokens:

```typescript
shotput()
  .s3AccessKeyId(process.env["AWS_ACCESS_KEY_ID"] ?? "")
  .s3SecretAccessKey(process.env["AWS_SECRET_ACCESS_KEY"] ?? "")
  .s3SessionToken(process.env["AWS_SESSION_TOKEN"] ?? "")  // Expires automatically
  .s3Region("us-east-1")
```

**Generate temporary credentials with AWS STS:**

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/shotput-read-only \
  --role-session-name shotput-session \
  --duration-seconds 3600
```

## Database Security

Shotput includes first-class support for SQLite (`{{sqlite://...}}`) and Redis (`{{redis://...}}`). Both are disabled by default and must be explicitly enabled.

### SQLite

SQLite databases are opened **read-only**. All paths are validated against `allowedBasePaths` before opening.

**Best Practices:**

```typescript
// GOOD: Restrict to a dedicated data directory
shotput()
  .allowedBasePaths(["./data"])
  .sqlite()
  .templateDir("./data")
  .template("{{sqlite://app.db/query:SELECT id, name FROM users}}")
  .run()
```

```typescript
// BAD: Allowing the entire filesystem
shotput()
  .allowedBasePaths(["/"])
  .sqlite()
```

**What Shotput enforces:**

- Paths containing `..` or `~` are rejected immediately.
- The resolved absolute path must start with one of the `allowedBasePaths` entries.
- Databases are opened with `{ readonly: true }` -- no writes are possible.

### Redis

Redis connections require explicit configuration via `.redis(url | options)` or the `REDIS_URL` / `VALKEY_URL` environment variables.

**Credential Management:**

```typescript
// GOOD: URL from environment variable
shotput().redis(process.env["REDIS_URL"] ?? "redis://localhost:6379")

// GOOD: Separate credentials
shotput().redis({
  redisUsername: process.env["REDIS_USERNAME"] ?? "",
  redisPassword: process.env["REDIS_PASSWORD"] ?? "",
})

// BEST: Hashed password -- Bun.password.verify() runs before connecting
shotput().redis({
  redisPassword: process.env["REDIS_PASSWORD"] ?? "",
  redisPasswordHash: process.env["REDIS_PASSWORD_HASH"] ?? "",
})

// BAD: Hardcoded credentials
shotput().redis("redis://admin:plaintext@prod-redis:6379")
```

**Supported operations** are limited to `get:key` and `keys:pattern` -- no write or delete operations are possible through the template placeholder interface.

**Production checklist:**

- Use TLS (`rediss://`) in production environments.
- Scope the Redis user to `read` permissions only (ACL in Redis 6+).
- Store credentials in environment variables or a secrets manager, never in code.
- Use `REDIS_PASSWORD_HASH` for an extra layer of verification when the hash is stored separately from the plaintext password.

## Skills Security

### Local Skills Only (Recommended)

```typescript
// PRODUCTION: Only local skills (default)
shotput()
  .skillsDir("./skills")
  .allowRemoteSkills(false)
```

### Remote Skills (Use with Caution)

If you must use remote skills:

```typescript
shotput()
  .skillsDir("./skills")
  .allowRemoteSkills(true)
  .allowedSkillSources([
    "your-org/verified-skills",  // Only your organization
    "anthropics/skills",          // Trusted third party
  ])
```

### Supply Chain Security

**Risks of remote skills:**

- Dependency on GitHub availability
- Risk of compromised repositories
- Potential for malicious content injection
- No version control over content

**Mitigation strategies:**

1. **Cache Remote Skills Locally**

```bash
# Download skills to local directory
git clone https://github.com/anthropics/skills ./skills/anthropics

# Use local skills in production
{{skill:brand-guidelines}}  # Loads from ./skills/brand-guidelines
```

1. **Verify Content**

```bash
# Check skill content before use
cat ./skills/anthropics/brand-guidelines/README.md
```

1. **Pin Versions**

```bash
# Use specific commit or tag
git clone --branch v1.0.0 https://github.com/anthropics/skills
```

## Production Configuration

### Minimal Production Config

```typescript
import { shotput } from "shotput";

const base = shotput()
  // Core settings
  .templateDir("./templates")
  .responseDir("./output")
  // File access - very restrictive
  .allowedBasePaths(["./templates", "./data"])
  // HTTP - restrict to known domains (or .allowHttp(false) to disable entirely)
  .allowHttp(true)
  .allowedDomains(["api.trusted-service.com"])
  .httpTimeout(5000)
  // Functions - disabled
  .allowFunctions(false)
  // Skills - local only
  .skillsDir("./skills")
  .allowRemoteSkills(false)
  // S3 - with IAM role (no credentials needed when using EC2/ECS/Lambda role)
  .s3Region(process.env["AWS_REGION"] ?? "us-east-1")
  .maxBucketFiles(50)
  // Limits
  .maxPromptLength(100000)
  .maxConcurrency(4)
  // Debug - disabled
  .debug(false)
  .build();

// Derive per-request programs from the base
const result = await base.templateFile("prompt.md").run();
```

### Environment-Specific Configs

```typescript
import { shotput } from "shotput";

const env = process.env["NODE_ENV"] ?? "development";

const base = shotput()
  .allowRemoteSkills(env === "development")
  .allowFunctions(env === "development")
  .debug(env !== "production")
  .allowHttp(true)
  .allowedDomains(
    env === "production"
      ? ["api.example.com"]
      : env === "staging"
        ? ["api.staging.example.com"]
        : []  // development: all domains allowed
  )
  .httpTimeout(env === "production" ? 5000 : 30000)
  .maxPromptLength(env === "production" ? 50000 : 100000)
  .build();
```

## Security Checklist

### Pre-Deployment

- [ ] Review all `allowedBasePaths` -- are they minimal?
- [ ] Disable `.allowFunctions(false)` unless absolutely necessary
- [ ] Set `.allowRemoteSkills(false)`
- [ ] Configure `.allowedDomains()` if HTTP is enabled
- [ ] Use environment variables for all credentials (S3, Redis)
- [ ] Set appropriate `.maxPromptLength()` and `.maxBucketFiles()`
- [ ] Disable `.debug(false)` in production
- [ ] Review all custom functions for security issues
- [ ] Audit local skills directory for untrusted content
- [ ] Only call `.sqlite()` / `.redis()` when database sources are actually needed
- [ ] For Redis: use TLS (`rediss://`) and a read-only ACL user in production
- [ ] For SQLite: confirm databases are within `allowedBasePaths` and contain no sensitive data
- [ ] Test with security scanning tools

### AWS/S3 Specific

- [ ] Use IAM roles instead of access keys when possible
- [ ] Implement least-privilege IAM policies
- [ ] Enable S3 bucket logging
- [ ] Use S3 bucket policies to restrict access
- [ ] Enable S3 versioning for audit trails
- [ ] Use VPC endpoints for S3 access
- [ ] Rotate temporary credentials regularly
- [ ] Monitor S3 access patterns

### Runtime Monitoring

- [ ] Log all template processing operations
- [ ] Monitor for unusual file access patterns
- [ ] Alert on HTTP requests to unexpected domains
- [ ] Track S3 API usage and costs
- [ ] Monitor for path traversal attempts
- [ ] Review debug logs regularly (in non-prod)

## Common Vulnerabilities

### 1. Path Traversal

**Vulnerability:**

```markdown
{{../../../etc/passwd}}
```

**Mitigation:**

- Automatically prevented by Shotput
- Verify `allowedBasePaths` is properly configured
- Audit for symlinks in allowed directories

### 2. Server-Side Request Forgery (SSRF)

**Vulnerability:**

```markdown
{{http://169.254.169.254/latest/meta-data/}}  <!-- AWS metadata endpoint -->
{{http://localhost:8080/admin}}
```

**Mitigation:**

- Use `allowedDomains` whitelist
- Never allow `localhost`, `127.0.0.1`, or internal IPs
- Use network-level controls

### 3. Credential Exposure

**Vulnerability:**

```typescript
// Hardcoded credentials in code
s3SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

**Mitigation:**

- Always use environment variables
- Use IAM roles when available
- Rotate credentials regularly
- Never commit credentials to version control

### 4. Arbitrary Code Execution

**Vulnerability:**

```markdown
{{TemplateType.Function:/tmp/user-uploaded-malicious.js}}
```

**Mitigation:**

- Disable `allowFunctions` in production
- Use strict `allowedFunctionPaths`
- Never execute user-provided functions
- Code review all custom functions

### 5. Resource Exhaustion

**Vulnerability:**

```markdown
<!-- Processing thousands of large files -->
{{s3://bucket/huge-prefix/}}
```

**Mitigation:**

- Set `maxPromptLength`
- Set `maxBucketFiles`
- Configure `httpTimeout`
- Monitor resource usage

### 6. Information Disclosure

**Vulnerability:**

- Debug logs containing sensitive data
- Error messages exposing file paths
- Stack traces in production

**Mitigation:**

- Disable debug mode in production
- Sanitize error messages
- Log to secure locations only

### 7. Supply Chain Attacks

**Vulnerability:**

```markdown
{{skill:github:untrusted-org/malicious-repo/skill}}
```

**Mitigation:**

- Use `allowRemoteSkills: false` in production
- Whitelist trusted sources only
- Cache skills locally
- Verify content before use

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS S3 Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
