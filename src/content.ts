import type { FileResult } from "./types";

export const processContent = async (
	content: string,
	remainingLength: number,
): Promise<FileResult> => {
	if (content.length > remainingLength) {
		return {
			content: content.slice(0, remainingLength),
			length: remainingLength,
			truncated: true,
			remainingLength: 0,
		};
	}
	return {
		content,
		length: content.length,
		truncated: false,
		remainingLength: remainingLength - content.length,
	};
};
