import { mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { processContent } from "./content";

export const ensureDirectoryExists = async (dir: string): Promise<void> => {
	try {
		await mkdir(dir, { recursive: true });
	} catch (err) {
		if ((err as { code?: string }).code !== "EEXIST") {
			throw new Error(`Failed to create directory ${dir}: ${err}`);
		}
	}
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
	let combinedContent = "";
	let combinedRemainingCount = remainingLength;
	for (const file of await getAllFiles(path)) {
		const fileContent = `filename:${path}:\n${await Bun.file(file).text()}\n`;
		const processed = await processContent(fileContent, combinedRemainingCount);

		if (processed.truncated) {
			console.warn(`Content truncated for ${file} due to length limit`);
		}

		combinedContent += processed.content;
		combinedRemainingCount -= processed.length;

		if (combinedRemainingCount <= 0) {
			console.warn("Maximum prompt length reached");
			break;
		}
	}

	return {
		operationResults: result.replace(match, combinedContent),
		combinedRemainingCount,
	};
};
