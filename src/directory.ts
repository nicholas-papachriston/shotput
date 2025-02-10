import { mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { bucketExists } from "./s3";

const log = getLogger("directory");

const processDirectory = async (dir: string) => {
	if (dir.startsWith("s://")) return await bucketExists(dir);
	await mkdir(dir, { recursive: true }).catch((err) => {
		if ((err as { code?: string }).code !== "EEXIST") {
			throw new Error(`Failed to create directory ${dir}: ${err}`);
		}
		throw err;
	});
};

export const ensureDirectoryExists = async (
	sourceDir: string,
	resultsDir: string,
): Promise<void> => {
	Promise.all([processDirectory(sourceDir), processDirectory(resultsDir)]);
};

const getAllFiles = async (dirPath: string): Promise<string[]> => {
	const files = await readdir(dirPath, { withFileTypes: true });

	const paths = await Promise.all(
		files.map(async (file) => {
			const path = join(dirPath, file.name);
			return file.isDirectory() ? getAllFiles(path) : [path];
		}),
	);

	return paths.flat();
};

export const handleDirectory = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Processing directory: ${path}`);
	let combinedContent = "";
	let combinedRemainingCount = remainingLength;
	for (const file of await getAllFiles(path)) {
		const fileContent = `filename:${path}:\n${await Bun.file(file).text()}\n`;
		const processed = await processContent(fileContent, combinedRemainingCount);

		if (processed.truncated) {
			log.warn(`Content truncated for ${file} due to length limit`);
		}

		combinedContent += processed.content;
		combinedRemainingCount -= processed.length;

		if (combinedRemainingCount <= 0) {
			log.warn("Maximum template length reached");
			break;
		}
	}

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};
