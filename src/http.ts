import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { handlerErrorResult } from "./handlerResult";
import { getLogger } from "./logger";
import { SecurityError, validateUrl } from "./security";
import { getCountFn } from "./tokens";

const log = getLogger("http");

/** When tokenizer is set, remainingLength is in tokens; use this for char budget. */
const CHARS_PER_TOKEN = 4;

async function readHttpBodyStream(
	response: Response,
	config: ShotputConfig,
	remainingLength: number,
): Promise<{ content: string; usedLength: number }> {
	const countFn = getCountFn(config);
	const charBudget = config.tokenizer
		? remainingLength * CHARS_PER_TOKEN
		: remainingLength;

	const body = response.body;
	if (!body) {
		const content = await response.text();
		const processed = await processContent(content, remainingLength, config);
		return {
			content: processed.content,
			usedLength: processed.length,
		};
	}

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let content = "";
	let currentLength = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value, { stream: true });

		if (currentLength + chunk.length > charBudget) {
			const allowed = charBudget - currentLength;
			if (allowed > 0) {
				content += chunk.slice(0, allowed);
			}
			await reader.cancel();
			break;
		}

		content += chunk;
		currentLength += chunk.length;
	}

	const usedLength = config.tokenizer ? countFn(content) : content.length;
	return { content, usedLength };
}

/**
 * Handles HTTP/HTTPS resource interpolation.
 * Validates the URL against security rules before fetching.
 * Uses response body stream when Content-Length >= httpStreamThresholdBytes to reduce memory use.
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
		validateUrl(config, path);

		const response = await fetch(path, {
			signal: AbortSignal.timeout(config.httpTimeout),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const contentLengthHeader = response.headers?.get("content-length");
		const contentLength = contentLengthHeader
			? Number.parseInt(contentLengthHeader, 10)
			: 0;
		const useStream =
			response.body &&
			!Number.isNaN(contentLength) &&
			contentLength >= (config.httpStreamThresholdBytes ?? 1024 * 1024);

		let content: string;
		let combinedRemainingCount: number;

		if (useStream) {
			log.info(
				`HTTP response for ${path} is ${contentLength} bytes, using stream`,
			);
			const streamResult = await readHttpBodyStream(
				response,
				config,
				remainingLength,
			);
			content = streamResult.content;
			combinedRemainingCount = Math.max(
				0,
				remainingLength - streamResult.usedLength,
			);
			if (streamResult.usedLength >= remainingLength && content.length > 0) {
				log.warn(`HTTP content truncated for ${path} due to length limit`);
			}
		} else {
			content = await response.text();
			const processed = await processContent(content, remainingLength, config);
			content = processed.content;
			combinedRemainingCount = processed.remainingLength;
			if (processed.truncated) {
				log.warn(`HTTP content truncated for ${path} due to length limit`);
			}
		}

		return {
			operationResults: result.replace(match, content),
			combinedRemainingCount,
			replacement: content,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for ${path}: ${error.message}`);
		} else if (error instanceof Error && error.name === "TimeoutError") {
			log.error(`HTTP request timeout for ${path}`);
		} else {
			log.error(`HTTP request failed for ${path}: ${error}`);
		}
		const message =
			error instanceof Error && error.name === "TimeoutError"
				? "[Error: Request Timeout]"
				: `[Error fetching ${path}]`;
		return handlerErrorResult(result, match, remainingLength, error, {
			message,
		});
	}
};
