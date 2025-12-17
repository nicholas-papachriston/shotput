import { mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { bucketExists } from "./s3";
import { SecurityError, securityValidator } from "./security";

const log = getLogger("directory");

const processDirectory = async (dir: string) => {
	if (dir.startsWith("s://")) return await bucketExists(dir);
	// mkdir with recursive: true doesn't throw EEXIST, so no need to catch
	await mkdir(dir, { recursive: true });
};

export const ensureDirectoryExists = async (
	sourceDir: string,
	resultsDir: string,
): Promise<void> => {
	await Promise.all([
		processDirectory(sourceDir),
		processDirectory(resultsDir),
	]);
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

	try {
		// Security validation
		const validatedPath = securityValidator.validatePath(path);

		let combinedContent = "";
		let combinedRemainingCount = remainingLength;
		for (const file of await getAllFiles(validatedPath)) {
			if (combinedRemainingCount <= 0) {
				log.warn("Maximum template length reached");
				break;
			}

			const fileContent = `filename:${file}:\n${await Bun.file(file).text()}\n`;
			const processed = await processContent(
				fileContent,
				combinedRemainingCount,
			);

			if (processed.truncated) {
				log.warn(`Content truncated for ${file} due to length limit`);
			}

			combinedContent += processed.content;
			combinedRemainingCount = processed.remainingLength;
		}

		return {
			operationResults: result.replace(match, combinedContent),
			combinedRemainingCount,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for directory ${path}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to process directory ${path}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Error reading directory ${path}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
