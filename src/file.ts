import { processContent } from "./content";

export const handleFile = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	const fileContent = `filename:${path}:\n${await Bun.file(path).text()}`;
	const processed = await processContent(fileContent, remainingLength);
	if (processed.truncated) {
		console.warn(`Content truncated for ${path} due to length limit`);
	}
	return {
		operationResults: result.replace(match, processed.content),
		combinedRemainingCount: processed.remainingLength,
	};
};
