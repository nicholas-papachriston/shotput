import { dirname } from "node:path";
import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, validatePath } from "./security";

const log = getLogger("glob");

/**
 * Handles glob patterns by scanning the file system and interpolating matching files.
 * This function also serves as a handler for regex-based searches.
 */
export const handleGlob = async (
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
	log.info(`Handling glob: ${path}`);

	try {
		// Determine base path for security validation
		// Find the first character that indicates a wildcard
		const firstWildcard = path.search(/[*?\[\]]/);
		const basePath =
			firstWildcard !== -1 ? path.slice(0, firstWildcard) : dirname(path);

		// Validate that the base directory for the glob is allowed
		validatePath(config, basePath || ".");

		// If there are no wildcards, treat as a direct file path
		// since Bun.Glob doesn't match exact paths without wildcards
		if (firstWildcard === -1) {
			const validatedFilePath = validatePath(config, path);
			const fileHandle = Bun.file(validatedFilePath);
			const exists = await fileHandle.exists();

			if (exists) {
				const content = await fileHandle.text();
				const fileHeader = `filename:${validatedFilePath}:\n`;
				const processed = await processContent(
					fileHeader + content,
					remainingLength,
				);

				if (processed.truncated) {
					log.warn(
						`Content truncated for ${validatedFilePath} due to length limit`,
					);
				}

				return {
					operationResults: result.replace(match, processed.content),
					combinedRemainingCount: processed.remainingLength,
					replacement: processed.content,
				};
			}

			// File doesn't exist, return empty
			return {
				operationResults: result.replace(match, ""),
				combinedRemainingCount: remainingLength,
			};
		}

		const glob = new Bun.Glob(path);
		let combinedContent = "";
		let currentRemaining = remainingLength;

		// Scan for matching files
		for await (const file of glob.scan({ onlyFiles: true })) {
			if (currentRemaining <= 0) {
				log.warn("Maximum template length reached");
				break;
			}

			try {
				// Validate each file found by the glob
				const validatedFilePath = validatePath(config, file);

				const fileHandle = Bun.file(validatedFilePath);
				const exists = await fileHandle.exists();
				if (!exists) continue;

				const content = await fileHandle.text();
				const fileHeader = `filename:${validatedFilePath}:\n`;

				const processed = await processContent(
					fileHeader + content,
					currentRemaining,
				);

				if (processed.truncated) {
					log.warn(
						`Content truncated for ${validatedFilePath} due to length limit`,
					);
				}

				combinedContent += processed.content;
				currentRemaining = processed.remainingLength;
			} catch (error) {
				if (error instanceof SecurityError) {
					log.error(`Security error for file ${file}: ${error.message}`);
					continue;
				}
				log.error(`Error processing file ${file}: ${error}`);
			}
		}

		return {
			operationResults: result.replace(match, combinedContent),
			combinedRemainingCount: currentRemaining,
			replacement: combinedContent,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for glob pattern ${path}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Error processing glob pattern ${path}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Error processing glob ${path}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
