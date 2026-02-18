import type { ShotputConfig } from "./config";
import { handlerErrorResult } from "./handlerResult";
import { getLogger } from "./logger";
import { SecurityError, validatePath } from "./security";
import { getCountFn } from "./tokens";

const log = getLogger("fileStream");

/** When tokenizer is set, remainingLength is in tokens; use this as char budget for streaming. */
const CHARS_PER_TOKEN = 4;

/**
 * Handles reading large files using streams to avoid memory issues.
 * Truncates content if it exceeds the remaining length limit.
 */
export const handleFileStream = async (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<{ operationResults: string; combinedRemainingCount: number }> => {
	log.info(`Handling file stream: ${path}`);

	try {
		// Security validation
		const validatedPath = validatePath(config, path);

		// Check if file exists and is accessible
		const file = Bun.file(validatedPath);
		const fileExists = await file.exists();
		if (!fileExists) {
			throw new Error(`File not found: ${validatedPath}`);
		}

		const countFn = getCountFn(config);
		const charBudget = config.tokenizer
			? remainingLength * CHARS_PER_TOKEN
			: remainingLength;

		const stream = file.stream();
		const reader = stream.getReader();
		const decoder = new TextDecoder();

		let content = `filename:${validatedPath}:\n`;
		let currentLength = content.length;
		let truncated = false;

		// If the header itself is longer than budget
		if (currentLength > charBudget) {
			content = content.slice(0, charBudget);
			truncated = true;
		} else {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });

				if (currentLength + chunk.length > charBudget) {
					const allowed = charBudget - currentLength;
					if (allowed > 0) {
						content += chunk.slice(0, allowed);
					}
					truncated = true;
					await reader.cancel();
					break;
				}

				content += chunk;
				currentLength += chunk.length;
			}
		}

		if (truncated) {
			log.warn(`Content truncated for ${validatedPath} due to length limit`);
		}

		const usedLength = config.tokenizer ? countFn(content) : content.length;
		const combinedRemaining = Math.max(0, remainingLength - usedLength);

		return {
			operationResults: result.replace(match, content),
			combinedRemainingCount: combinedRemaining,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for ${path}: ${error.message}`);
		} else {
			log.error(`Failed to read file ${path}: ${error}`);
		}
		return handlerErrorResult(result, match, remainingLength, error, {
			path,
		});
	}
};
