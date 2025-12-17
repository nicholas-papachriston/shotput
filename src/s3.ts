import { CONFIG } from "./config";
import { getLogger } from "./logger";
import { getS3File, parseS3Path } from "./s3-client";
import { SecurityError, securityValidator } from "./security";
import type { S3Credentials } from "./types";
import { createXmlParser } from "./xml";

const log = getLogger("s3");

export const getStorageServiceUrl = (
	bucket: string,
	key?: string,
	isDirectoryBucket = false,
	availabilityZoneId?: string,
) => {
	if (CONFIG.cloudflareR2Url) {
		return `https://${CONFIG.cloudflareR2Url}/${bucket}${key ? `/${key}` : ""}`;
	}

	// Directory buckets use S3 Express endpoints
	if (isDirectoryBucket && availabilityZoneId) {
		const region = CONFIG.s3Region || "us-east-1";
		return `https://${bucket}.s3express-${availabilityZoneId}.${region}.amazonaws.com${key ? `/${key}` : ""}`;
	}

	// Standard buckets
	return `https://${bucket}.${CONFIG.awsS3Url}${key ? `/${key}` : ""}`;
};

const handleObject = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	credentials?: Partial<S3Credentials>,
) => {
	let combinedContent = `filename:${path}:\n`;
	let combinedRemainingCount = remainingLength;

	const s3FileOrClient = getS3File(path, credentials);

	// Type guard: getS3File returns S3File when path has a key
	if (!("stream" in s3FileOrClient)) {
		throw new Error(`Invalid S3 path for file operation: ${path}`);
	}

	const fileStream = s3FileOrClient.stream();

	for await (const chunk of fileStream) {
		combinedContent += chunk.toString();
	}

	combinedRemainingCount -= combinedContent.length;

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};

interface ListObjectsResponse {
	keys: string[];
	nextContinuationToken?: string;
}

const parseS3ListResponse = (
	xmlParser: ReturnType<typeof createXmlParser>,
	listXml: string,
): ListObjectsResponse => {
	const keys = xmlParser.parseS3ListResponse(listXml);
	const parser = xmlParser.parse(listXml);
	const nextContinuationToken = parser.children.find(
		(child) => child.tag === "NextContinuationToken",
	)?.text;

	return {
		keys,
		nextContinuationToken,
	};
};

const handleObjectPrefix = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	credentials?: Partial<S3Credentials>,
) => {
	const maxItems = CONFIG.maxBucketFiles;
	const bucketInfo = parseS3Path(path);
	const {
		bucket,
		key: prefix,
		isDirectoryBucket,
		availabilityZoneId,
	} = bucketInfo;
	const xmlParser = createXmlParser();

	let combinedContent = "";
	let combinedRemainingCount = remainingLength;
	let processedItems = 0;
	let continuationToken: string | undefined;

	do {
		// Build URL with pagination token if present
		const listUrl = new URL(
			`https://${getStorageServiceUrl(bucket, undefined, isDirectoryBucket, availabilityZoneId)}`,
		);
		listUrl.searchParams.append("list-type", "2");
		listUrl.searchParams.append("prefix", prefix || "");
		if (continuationToken) {
			listUrl.searchParams.append("continuation-token", continuationToken);
		}

		const listResponse = await fetch(listUrl.toString());

		if (!listResponse.ok) {
			throw new Error(
				`Failed to list objects in prefix ${path}: ${listResponse.statusText}`,
			);
		}

		const listXml = await listResponse.text();
		const { keys, nextContinuationToken } = parseS3ListResponse(
			xmlParser,
			listXml,
		);

		for (const key of keys) {
			if (!key) continue;
			if (combinedRemainingCount <= 0 || processedItems >= maxItems) {
				return {
					operationResults: result.replace(match, combinedContent),
					combinedRemainingCount,
				};
			}

			const object = await handleObject(
				result,
				`s3://${bucket}/${key}`,
				match,
				remainingLength,
				credentials,
			);

			if (object.combinedRemainingCount <= 0) {
				return {
					operationResults: result.replace(match, combinedContent),
					combinedRemainingCount,
				};
			}

			combinedContent += object.operationResults;
			combinedRemainingCount = object.combinedRemainingCount;
			processedItems++;
		}

		continuationToken = nextContinuationToken;
	} while (continuationToken && processedItems < maxItems);

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};

export const bucketExists = async (
	uncleanBucketString: string,
	_credentials?: Partial<S3Credentials>,
): Promise<void> => {
	const cleanPath = uncleanBucketString.replace("s//", "s3://");
	const bucketInfo = parseS3Path(cleanPath);
	const { bucket, isDirectoryBucket, availabilityZoneId } = bucketInfo;

	await fetch(
		`https://${getStorageServiceUrl(bucket, undefined, isDirectoryBucket, availabilityZoneId)}`,
		{
			method: "HEAD",
		},
	).catch((err) => {
		if (err instanceof Error && err.message.includes("Failed to fetch")) {
			throw new Error(`Bucket ${bucket} does not exist`);
		}
		throw err;
	});
};

/**
 * @param path - S3 path. e.g. s3://bucket-name/prefix/ or s3://bucket-name/prefix/file.txt
 * @param credentials - Optional S3 credentials to override defaults
 */
export const handleS3 = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	credentials?: Partial<S3Credentials>,
) => {
	log.info(`Handling S3 path: ${path}`);

	try {
		// Security validation
		securityValidator.validateS3Path(path);

		// Parse the path to check for directory buckets
		const bucketInfo = parseS3Path(path);
		if (bucketInfo.isDirectoryBucket) {
			log.info(
				`Detected directory bucket: ${bucketInfo.bucket} (AZ: ${bucketInfo.availabilityZoneId})`,
			);
		}

		if (path.endsWith("/")) {
			return await handleObjectPrefix(
				result,
				path,
				match,
				remainingLength,
				credentials,
			);
		}
		return await handleObject(
			result,
			path,
			match,
			remainingLength,
			credentials,
		);
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for S3 path ${path}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to process S3 path ${path}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Error reading S3 path: ${error}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
