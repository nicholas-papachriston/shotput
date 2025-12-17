# S3 Bucket Setup for Examples

This guide helps you set up the S3 buckets and sample data needed to run the Shotput advanced examples.

## Quick Start

⚠️ **Important:** Buckets must be created manually before running the setup scripts.

### Step 1: Create S3 Buckets

Create the required buckets using AWS CLI or the AWS Console:

```bash
# Using AWS CLI (recommended)
aws s3 mb s3://my-bucket --region us-east-1
aws s3 mb s3://archive-bucket --region us-east-1

# Or via AWS Console: https://console.aws.amazon.com/s3/
# Click "Create bucket" and use the names above
```

For Cloudflare R2:
```bash
# Create via Cloudflare Dashboard: https://dash.cloudflare.com/
# Or using AWS CLI configured for R2
aws s3 mb s3://cache-bucket --profile r2
aws s3 mb s3://user-uploads --profile r2
aws s3 mb s3://cdn-assets --profile r2
```

### Step 2: Upload Sample Data

#### TypeScript/Bun Script (Recommended)

```bash
# Set credentials
export S3_ACCESS_KEY_ID=your-access-key
export S3_SECRET_ACCESS_KEY=your-secret-key
export S3_REGION=us-east-1

# Upload sample data to buckets
bun run examples/setup-s3-buckets.ts
```

#### Shell Script (Alternative)

```bash
# AWS CLI must be configured
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

# Upload sample data to buckets
./examples/setup-s3-buckets.sh
```

## What Gets Created

### Standard S3 Buckets

#### `my-bucket`
Main bucket used by most examples. Contains:
- `config/production.json` - Production configuration
- `config/app.json` - Application config
- `data/settings.json` - Settings file
- `logs/2024/01/15/` - Sample log files (2 files)
- `logs/2024/app.log` - Application logs
- `logs/latest/current.log` - Latest logs
- `large-data/export.json` - Large data file for streaming examples
- Total: 9 files

**Used in:**
- `01-s3-basic.ts`
- `04-streaming.ts` 
- `06-length-limits.ts`
- `07-mixed-sources.ts`

#### `archive-bucket`
Archive bucket for older data. Contains:
- `old-logs/app.log` - Archived logs
- Total: 1 file

**Used in:**
- `02-s3-directory-buckets.ts`

### Cloudflare R2 Buckets (with `--r2` flag)

#### `cache-bucket`
- `api/responses.json` - Cached API responses

#### `user-uploads`
- `images/sample.json` - Sample upload metadata

#### `cdn-assets`
- `config.json` - CDN configuration

**Used in:**
- `03-s3-cloudflare-r2.ts`

### Directory Buckets (Manual Setup Required)

Directory buckets (AWS S3 Express One Zone) must be created manually through AWS Console or CLI:

#### `logs--use1-az4--x-s3`
High-performance logging bucket in `use1-az4` availability zone.

```bash
aws s3control create-bucket \
  --bucket logs--use1-az4--x-s3 \
  --create-bucket-configuration 'Location={Name=use1-az4,Type=AvailabilityZone}'
```

#### `events--use1-az4--x-s3`
High-performance events bucket in `use1-az4` availability zone.

```bash
aws s3control create-bucket \
  --bucket events--use1-az4--x-s3 \
  --create-bucket-configuration 'Location={Name=use1-az4,Type=AvailabilityZone}'
```

**Used in:**
- `02-s3-directory-buckets.ts`

**Note:** Directory buckets provide single-digit millisecond latency but require special configuration and must be in the same AZ as your compute resources for best performance.

## Script Options

### Dry Run Mode

Preview what would be created without making changes:

```bash
# TypeScript
bun run examples/setup-s3-buckets.ts --dry-run

# Shell
./examples/setup-s3-buckets.sh --dry-run
```

### Cleanup Mode

Delete all created buckets and their contents:

```bash
# TypeScript
bun run examples/setup-s3-buckets.ts --cleanup

# Shell
./examples/setup-s3-buckets.sh --cleanup
```

**⚠️ Warning:** This permanently deletes all buckets and their data. Use with caution!

### Cloudflare R2 Mode

Set up Cloudflare R2 buckets instead of AWS S3:

```bash
# TypeScript
export CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
bun run examples/setup-s3-buckets.ts --r2

# Shell (requires R2-configured AWS CLI profile)
./examples/setup-s3-buckets.sh --r2
```

## Prerequisites

### For TypeScript Script

- Bun runtime installed
- AWS credentials via environment variables:
  ```bash
  S3_ACCESS_KEY_ID=your-key
  S3_SECRET_ACCESS_KEY=your-secret
  S3_REGION=us-east-1  # optional, defaults to us-east-1
  ```

### For Shell Script

- AWS CLI installed and configured
- AWS credentials via:
  - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - AWS profile (`AWS_PROFILE`)
  - AWS CLI default configuration

### For Cloudflare R2

- R2 API credentials
- Account endpoint URL:
  ```bash
  CLOUDFLARE_R2_URL=account-id.r2.cloudflarestorage.com
  ```

Get credentials from: Cloudflare Dashboard → R2 → Manage R2 API Tokens

## Required AWS Permissions

The setup scripts require the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*",
        "arn:aws:s3:::archive-bucket",
        "arn:aws:s3:::archive-bucket/*",
        "arn:aws:s3:::cache-bucket",
        "arn:aws:s3:::cache-bucket/*",
        "arn:aws:s3:::user-uploads",
        "arn:aws:s3:::user-uploads/*",
        "arn:aws:s3:::cdn-assets",
        "arn:aws:s3:::cdn-assets/*"
      ]
    }
  ]
}
```

For directory buckets, additional permissions are needed:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:CreateBucket",
    "s3:PutObject",
    "s3:GetObject"
  ],
  "Resource": [
    "arn:aws:s3express:us-east-1:*:bucket/logs--use1-az4--x-s3",
    "arn:aws:s3express:us-east-1:*:bucket/logs--use1-az4--x-s3/*",
    "arn:aws:s3express:us-east-1:*:bucket/events--use1-az4--x-s3",
    "arn:aws:s3express:us-east-1:*:bucket/events--use1-az4--x-s3/*"
  ]
}
```

## Troubleshooting

### "Bucket already exists" Error

This is normal if you've run the setup before. The script will skip bucket creation and continue with file uploads.

### "Access Denied" Error

Check that:
1. Your credentials are correct
2. Your IAM user/role has the required permissions
3. The bucket names aren't already taken by another AWS account

### AWS CLI Not Found (Shell Script)

Install AWS CLI:
- macOS: `brew install awscli`
- Linux: `pip install awscli`
- Windows: Download from [AWS CLI installer](https://aws.amazon.com/cli/)

### Bun Not Found (TypeScript Script)

Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Directory Bucket Creation Fails

Directory buckets require:
1. AWS S3 Express One Zone to be available in your region
2. Specific availability zone IDs (e.g., `use1-az4`)
3. Special permissions via `s3control` API

See [AWS S3 Express documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-one-zone.html) for details.

### Region Mismatch

Ensure your `S3_REGION` or `AWS_REGION` matches where you want to create buckets:

```bash
export S3_REGION=us-west-2  # Change to your preferred region
```

## Cost Considerations

### Standard S3 Buckets

The sample data created is minimal (~10 KB total):
- Storage: $0.023 per GB/month → ~$0.0002/month
- Requests: Setup makes ~15 PUT requests → ~$0.00008

**Total estimated cost: < $0.01/month**

### Directory Buckets (S3 Express)

Directory buckets have different pricing:
- Storage: Higher per-GB cost
- Requests: Different request pricing model
- Data transfer: Standard rates apply

See [S3 Express One Zone pricing](https://aws.amazon.com/s3/pricing/) for details.

### Cloudflare R2

R2 offers:
- **Zero egress fees** (no charges for downloads)
- Free tier: 10 GB storage/month
- The sample data easily fits within the free tier

## Manual Verification

After running the setup, verify buckets were created:

```bash
# List all buckets
aws s3 ls

# List contents of a specific bucket
aws s3 ls s3://my-bucket --recursive

# Expected output:
# 2024-01-15 10:00:00       123 config/production.json
# 2024-01-15 10:00:00        89 data/settings.json
# ...
```

Or use the AWS Console:
1. Go to [S3 Console](https://console.aws.amazon.com/s3/)
2. Verify `my-bucket` and `archive-bucket` appear
3. Click into each bucket to see uploaded files

## Next Steps

After setup is complete:

1. **Run basic S3 example:**
   ```bash
   bun run examples/advanced/01-s3-basic.ts
   ```

2. **Try streaming with large files:**
   ```bash
   bun run examples/advanced/04-streaming.ts
   ```

3. **Experiment with mixed sources:**
   ```bash
   bun run examples/advanced/07-mixed-sources.ts
   ```

4. **Review the examples:**
   - See [examples/README.md](./README.md) for complete documentation
   - Check [docs/s3-advanced-features.md](../docs/s3-advanced-features.md) for advanced usage

## Cleanup

When you're done with the examples, clean up to avoid ongoing charges:

```bash
# TypeScript
bun run examples/setup-s3-buckets.ts --cleanup

# Shell
./examples/setup-s3-buckets.sh --cleanup
```

This will:
- Delete all objects in each bucket
- Delete the buckets themselves
- Not affect directory buckets (delete those manually)

**Note:** Directory buckets must be deleted manually through AWS Console or CLI.

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review AWS credentials and permissions
3. Ensure AWS CLI or Bun is properly installed
4. See [docs/s3-advanced-features.md](../docs/s3-advanced-features.md) for S3 configuration help
5. Open an issue on GitHub with error details

## Reference

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS CLI S3 Commands](https://docs.aws.amazon.com/cli/latest/reference/s3/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Shotput Main Documentation](../README.md)
- [S3 Advanced Features](../docs/s3-advanced-features.md)
