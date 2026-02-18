import type { ShotputConfig } from "./config";
import { getCountFn } from "./tokens";
import type { FileResult } from "./types";

/**
 * Process content with optional truncation by remaining budget.
 * When config.tokenizer is set, remainingLength and length are in tokens; otherwise characters.
 */
export const processContent = async (
	content: string,
	remainingLength: number,
	config?: ShotputConfig,
): Promise<FileResult> => {
	const countFn = config ? getCountFn(config) : (t: string) => t.length;
	const contentLength = countFn(content);

	if (contentLength <= remainingLength) {
		return {
			content,
			length: contentLength,
			truncated: false,
			remainingLength: remainingLength - contentLength,
		};
	}

	// Truncate by budget: find largest prefix whose count <= remainingLength
	let low = 0;
	let high = content.length;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (countFn(content.slice(0, mid)) <= remainingLength) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}
	const truncatedContent = content.slice(0, low);
	const usedLength = countFn(truncatedContent);

	return {
		content: truncatedContent,
		length: usedLength,
		truncated: true,
		remainingLength: 0,
	};
};
