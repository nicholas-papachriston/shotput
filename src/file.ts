import { processContent } from "./content";
import { handleFileStream } from "./fileStream";
import { getLogger } from "./logger";
import { SecurityError, securityValidator } from "./security";

// Files larger than 1MB will use streaming to avoid memory issues
const STREAM_THRESHOLD_BYTES = 1024 * 1024;

const log = getLogger("file");

export const handleFile = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling file: ${path}`);

	try {
		// Security validation
		const validatedPath = securityValidator.validatePath(path);

		// Check if file exists and is accessible
		const file = Bun.file(validatedPath);
		const fileExists = await file.exists();
		if (!fileExists) {
			throw new Error(`File not found: ${validatedPath}`);
		}

		// Use streaming for large files to avoid memory issues
		const fileSize = file.size;
		if (fileSize > STREAM_THRESHOLD_BYTES) {
			log.info(`File ${validatedPath} is ${fileSize} bytes, using streaming`);
			return handleFileStream(result, path, match, remainingLength);
		}

		const fileContent = `filename:${validatedPath}:\n${await file.text()}`;
		const processed = await processContent(fileContent, remainingLength);

		if (processed.truncated) {
			log.warn(`Content truncated for ${validatedPath} due to length limit`);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for ${path}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to read file ${path}: ${error}`);
		return {
			operationResults: result.replace(match, `[Error reading ${path}]`),
			combinedRemainingCount: remainingLength,
		};
	}
};
