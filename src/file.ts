import { processContent } from "./content";
import { getLogger } from "./logger";

const log = getLogger("file");

export const handleFile = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling file: ${path}`);
	const fileContent = `filename:${path}:\n${await Bun.file(path).text()}`;
	const processed = await processContent(fileContent, remainingLength);
	if (processed.truncated) {
		log.warn(`Content truncated for ${path} due to length limit`);
	}
	return {
		operationResults: result.replace(match, processed.content),
		combinedRemainingCount: processed.remainingLength,
	};
};
