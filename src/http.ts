import { CONFIG } from "./config";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, securityValidator } from "./security";

const log = getLogger("http");

export const handleHttp = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling HTTP request: ${path}`);

	try {
		// Security validation
		securityValidator.validateUrl(path);

		const response = await fetch(path, {
			headers: {
				"User-Agent": `shotput/${process.env["npm_package_version"] || "1.0.0"}`,
				Accept: "text/plain,text/html,application/json,*/*",
			},
			signal: AbortSignal.timeout(CONFIG.httpTimeout || 30000),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const content = await response.text();
		const fileContent = `path: ${path}\nhttpResults: ${content}`;
		const processed = await processContent(fileContent, remainingLength);

		if (processed.truncated) {
			log.warn(`HTTP content truncated for ${path} due to length limit`);
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

		if (error instanceof Error && error.name === "TimeoutError") {
			log.error(`HTTP request timeout for ${path}`);
			return {
				operationResults: result.replace(match, `[HTTP Timeout: ${path}]`),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`HTTP request failed for ${path}: ${error}`);
		return {
			operationResults: result.replace(match, `[HTTP Error: ${path}]`),
			combinedRemainingCount: remainingLength,
		};
	}
};
