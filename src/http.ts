import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, validateUrl } from "./security";

const log = getLogger("http");

/**
 * Handles HTTP/HTTPS resource interpolation.
 * Validates the URL against security rules before fetching.
 */
export const handleHttp = async (
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
	log.info(`Handling HTTP request: ${path}`);

	try {
		// Security validation
		validateUrl(config, path);

		const response = await fetch(path, {
			signal: AbortSignal.timeout(config.httpTimeout),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const content = await response.text();
		const processed = await processContent(content, remainingLength);

		if (processed.truncated) {
			log.warn(`HTTP content truncated for ${path} due to length limit`);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
			replacement: processed.content,
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

		if (error instanceof Error && error.name === "TimeoutError") {
			log.error(`HTTP request timeout for ${path}`);
			return {
				operationResults: result.replace(match, "[Error: Request Timeout]"),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`HTTP request failed for ${path}: ${error}`);
		return {
			operationResults: result.replace(match, `[Error fetching ${path}]`),
			combinedRemainingCount: remainingLength,
		};
	}
};
