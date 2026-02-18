import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { handlerErrorResult } from "./handlerResult";
import { getLogger } from "./logger";
import { getS3File } from "./s3-client";
import { validateS3Path } from "./security";

const log = getLogger("s3");

interface S3Path {
	bucket: string;
	key: string;
	isPrefix: boolean;
}

/**
 * Parses an S3 URL (s3://bucket/key) into its components.
 */
const parseS3Path = (path: string): S3Path => {
	const url = new URL(path);
	const bucket = url.hostname;
	// Remove leading slash from pathname to get the key
	const key = url.pathname.startsWith("/")
		? url.pathname.slice(1)
		: url.pathname;
	const isPrefix = path.endsWith("/");
	return { bucket, key, isPrefix };
};

/**
 * Handles S3 resource interpolation. Supports both single objects and prefixes (directories).
 *
 * @param config - The current shotput configuration
 * @param result - The current template content being processed
 * @param path - The s3:// URL to interpolate
 * @param match - The original template marker to replace
 * @param remainingLength - The remaining character budget for this run
 */
export const handleS3 = async (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<{
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
}> => {
	log.info(`Handling S3 resource: ${path}`);

	try {
		// Security validation
		validateS3Path(config, path);

		const { bucket, key, isPrefix } = parseS3Path(path);

		if (isPrefix) {
			// Handle S3 prefix by listing objects
			// For now, we'll return an error since Bun's S3Client doesn't expose listObjects
			log.warn(`S3 prefix listing not yet implemented for ${path}`);
			const errorMsg = `[Error reading ${path}: S3 prefix listing not yet supported]`;
			return {
				operationResults: result.replace(match, errorMsg),
				combinedRemainingCount: remainingLength,
			};
		}

		// Handle single S3 object
		const s3File = getS3File(path, config);

		// getS3File returns an S3File when there's a key
		if (
			!key ||
			typeof (s3File as unknown as { text?: () => Promise<string> }).text !==
				"function"
		) {
			throw new Error(`Invalid S3 path or missing key: ${path}`);
		}

		const content = await (
			s3File as unknown as { text: () => Promise<string> }
		).text();
		const fileHeader = `s3://${bucket}/${key}:\n`;
		const processed = await processContent(
			fileHeader + content,
			remainingLength,
		);

		if (processed.truncated) {
			log.warn(`Content truncated for ${path} due to length limit`);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
			replacement: processed.content,
		};
	} catch (error) {
		log.error(`Failed to process S3 path ${path}: ${error}`);
		return handlerErrorResult(result, match, remainingLength, error, {
			path,
		});
	}
};

/**
 * Checks if a bucket exists.
 * Note: This is a helper that can be used by other parts of the system if needed.
 */
export const bucketExists = async (
	config: ShotputConfig,
	path: string,
): Promise<boolean> => {
	try {
		const s3File = getS3File(path, config);
		// Try to check if the file/bucket exists by attempting to get metadata
		if (
			typeof (s3File as unknown as { exists?: () => Promise<boolean> })
				.exists === "function"
		) {
			return await (
				s3File as unknown as { exists: () => Promise<boolean> }
			).exists();
		}
		return false;
	} catch {
		return false;
	}
};
