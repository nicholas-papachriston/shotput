import { getLogger } from "./logger";

const log = getLogger("glob");

export const handleGlob = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling glob: ${path}`);

	const glob = new Bun.Glob(path);

	let combinedContent = "";
	let combinedRemainingCount = remainingLength;

	try {
		for await (const file of glob.scan(".")) {
			try {
				if (combinedRemainingCount <= 0) break;
				log.info(`Processing file: ${file}`);
				const content = await Bun.file(file).text();

				const contentToAdd = content.slice(0, combinedRemainingCount);
				combinedContent += `filename:${file}:\ncontent:${contentToAdd}\n`;
				combinedRemainingCount -= contentToAdd.length;
			} catch (error) {
				log.warn(`Error processing file ${file}: ${error}`);
			}
		}

		return {
			operationResults: result.replace(match, combinedContent),
			combinedRemainingCount,
		};
	} catch (error) {
		log.error(`Error processing glob ${path}: ${error}`);
		throw error;
	}
};
