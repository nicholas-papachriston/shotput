import { S3Client } from "bun";
import { CONFIG } from "./config";
import { getLogger } from "./logger";
import type { S3BucketInfo, S3Credentials } from "./types";

const log = getLogger("s3-client");

/**
 * Parse an S3 path and extract bucket and key information
 * @param path - S3 path in the format s3://bucket/key or s3://bucket/
 */
export const parseS3Path = (path: string): S3BucketInfo => {
	const match = path.match(/^s3:\/\/([^/]+)\/?(.*)$/);
	if (!match) {
		throw new Error(`Invalid S3 path format: ${path}`);
	}

	const [, bucket, key] = match;
	const isDirectoryBucket = isDirectoryBucketName(bucket);
	const availabilityZoneId = isDirectoryBucket
		? extractAvailabilityZoneId(bucket)
		: undefined;

	return {
		bucket,
		key: key || undefined,
		isDirectoryBucket,
		availabilityZoneId,
	};
};

/**
 * Check if a bucket name follows the directory bucket naming convention
 * Directory buckets have the format: bucket-name--azid--x-s3
 */
export const isDirectoryBucketName = (bucket: string): boolean => {
	return /^[a-z0-9][a-z0-9-]*--[a-z0-9]+-az\d+--x-s3$/.test(bucket);
};

/**
 * Extract the availability zone ID from a directory bucket name
 */
export const extractAvailabilityZoneId = (
	bucket: string,
): string | undefined => {
	const match = bucket.match(/--([a-z0-9]+-az\d+)--x-s3$/);
	return match ? match[1] : undefined;
};

/**
 * Get the appropriate endpoint for a bucket
 */
export const getS3Endpoint = (
	bucketInfo: S3BucketInfo,
	credentials: S3Credentials,
): string | undefined => {
	// If endpoint is explicitly provided, use it
	if (credentials.endpoint) {
		return credentials.endpoint;
	}

	// Use configured Cloudflare R2 or AWS S3 URL
	if (CONFIG.cloudflareR2Url) {
		return `https://${CONFIG.cloudflareR2Url}`;
	}

	// For directory buckets, construct the S3 Express endpoint
	if (bucketInfo.isDirectoryBucket && bucketInfo.availabilityZoneId) {
		const region = credentials.region || CONFIG.s3Region || "us-east-1";
		return `https://${bucketInfo.bucket}.s3express-${bucketInfo.availabilityZoneId}.${region}.amazonaws.com`;
	}

	// For standard AWS S3 buckets
	if (credentials.region || CONFIG.s3Region) {
		const region = credentials.region || CONFIG.s3Region;
		if (credentials.virtualHostedStyle) {
			return `https://${bucketInfo.bucket}.s3.${region}.amazonaws.com`;
		}
		return `https://s3.${region}.amazonaws.com`;
	}

	// Default to configured AWS S3 URL
	if (CONFIG.awsS3Url) {
		return `https://${CONFIG.awsS3Url}`;
	}

	return undefined;
};

/**
 * Create an S3Client instance with credentials
 */
export const createS3Client = (
	bucketInfo: S3BucketInfo,
	overrideCredentials?: Partial<S3Credentials>,
): S3Client => {
	const credentials: S3Credentials = {
		accessKeyId:
			overrideCredentials?.accessKeyId || CONFIG.s3AccessKeyId || undefined,
		secretAccessKey:
			overrideCredentials?.secretAccessKey ||
			CONFIG.s3SecretAccessKey ||
			undefined,
		sessionToken:
			overrideCredentials?.sessionToken || CONFIG.s3SessionToken || undefined,
		region: overrideCredentials?.region || CONFIG.s3Region || undefined,
		bucket: bucketInfo.bucket,
		virtualHostedStyle:
			overrideCredentials?.virtualHostedStyle ?? CONFIG.s3VirtualHostedStyle,
		endpoint:
			overrideCredentials?.endpoint ||
			getS3Endpoint(bucketInfo, overrideCredentials || {}),
	};

	log.info(
		`Creating S3Client for bucket: ${bucketInfo.bucket}${bucketInfo.isDirectoryBucket ? " (directory bucket)" : ""}`,
	);

	// Filter out undefined values
	const clientConfig: Record<string, string | boolean> = {};
	if (credentials.accessKeyId)
		clientConfig["accessKeyId"] = credentials.accessKeyId;
	if (credentials.secretAccessKey)
		clientConfig["secretAccessKey"] = credentials.secretAccessKey;
	if (credentials.sessionToken)
		clientConfig["sessionToken"] = credentials.sessionToken;
	if (credentials.region) clientConfig["region"] = credentials.region;
	if (credentials.bucket) clientConfig["bucket"] = credentials.bucket;
	if (credentials.endpoint) clientConfig["endpoint"] = credentials.endpoint;
	if (credentials.virtualHostedStyle !== undefined)
		clientConfig["virtualHostedStyle"] = credentials.virtualHostedStyle;

	return new S3Client(clientConfig);
};

/**
 * Get an S3 file reference using credentials
 */
export const getS3File = (
	path: string,
	overrideCredentials?: Partial<S3Credentials>,
) => {
	const bucketInfo = parseS3Path(path);
	const client = createS3Client(bucketInfo, overrideCredentials);

	// If there's a key, return a file reference
	if (bucketInfo.key) {
		return client.file(bucketInfo.key);
	}

	// If there's no key, return the client for listing operations
	return client;
};
