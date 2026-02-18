import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ShotputConfig } from "./config";
import { handleFile } from "./file";
import { getLogger } from "./logger";
import { SecurityError, validatePath } from "./security";

const log = getLogger("directory");

/**
 * Ensures that the specified directories exist, creating them if necessary.
 */
export const ensureDirectoryExists = async (...dirs: string[]) => {
	for (const dir of dirs) {
		try {
			await mkdir(dir, { recursive: true });
		} catch (error) {
			const err = error as { code?: string };
			if (err.code !== "EEXIST") {
				throw error;
			}
		}
	}
};

/**
 * Handles directory interpolation by reading all files and subdirectories.
 */
export const handleDirectory = async (
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
	log.info(`Processing directory: ${path}`);

	try {
		// Security validation
		const validatedPath = validatePath(config, path);

		const entries = await readdir(validatedPath);
		let currentRemaining = remainingLength;
		let directoryContent = "";

		for (const entry of entries) {
			if (currentRemaining <= 0) {
				log.warn("Maximum template length reached");
				break;
			}

			const entryPath = join(validatedPath, entry);
			const entryStats = await stat(entryPath);

			if (entryStats.isDirectory()) {
				// Recursively handle subdirectories
				// We pass an empty string as 'result' and 'match' to just get the content back
				const subDirResult = await handleDirectory(
					config,
					"",
					entryPath,
					"",
					currentRemaining,
				);
				directoryContent += subDirResult.operationResults;
				currentRemaining = subDirResult.combinedRemainingCount;
			} else {
				// Handle file
				// Use a placeholder to extract only the file content
				const placeholder = `__SHOTPUT_FILE_${entry}__`;
				const fileResult = await handleFile(
					config,
					placeholder,
					entryPath,
					placeholder,
					currentRemaining,
				);
				directoryContent += fileResult.operationResults;
				currentRemaining = fileResult.combinedRemainingCount;
			}
		}

		// If match is provided, replace it in the original result.
		// Otherwise (recursive call), return the content directly.
		const operationResults = match
			? result.replace(match, directoryContent)
			: directoryContent;

		return {
			operationResults,
			combinedRemainingCount: currentRemaining,
			replacement: directoryContent,
		};
	} catch (error) {
		log.error(`Failed to process directory ${path}: ${error}`);
		const errorMsg =
			error instanceof SecurityError
				? `[Security Error: ${error.message}]`
				: `[Error processing directory ${path}]`;
		return {
			operationResults: match ? result.replace(match, errorMsg) : errorMsg,
			combinedRemainingCount: remainingLength,
		};
	}
};
