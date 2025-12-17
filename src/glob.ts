import { join } from "node:path";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, securityValidator } from "./security";

const log = getLogger("glob");

export const handleGlob = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling glob: ${path}`);

	try {
		const firstWildcardIndex = path.search(/[*?[\]]/);
		let basePath = ".";
		let pattern = path;

		if (firstWildcardIndex !== -1) {
			const pathBeforeWildcard = path.slice(0, firstWildcardIndex);
			const lastSlashIndex = pathBeforeWildcard.lastIndexOf("/");

			if (lastSlashIndex !== -1) {
				basePath = path.slice(0, lastSlashIndex);
				pattern = path.slice(lastSlashIndex + 1);
			}
		} else {
			// If no wildcard, treat the path as a literal file
			const lastSlashIndex = path.lastIndexOf("/");
			if (lastSlashIndex !== -1) {
				basePath = path.slice(0, lastSlashIndex);
				pattern = path.slice(lastSlashIndex + 1);
			}
		}

		// Validate glob pattern for common syntax errors
		if (pattern.includes("[") && !pattern.includes("]")) {
			log.error(`Invalid glob pattern ${path}: Unclosed bracket`);
			return {
				operationResults: result.replace(
					match,
					`[Invalid glob pattern: ${path}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		try {
			const glob = new Bun.Glob(pattern);

			let combinedContent = "";
			let combinedRemainingCount = remainingLength;
			let processedFiles = 0;

			try {
				for await (const file of glob.scan(basePath)) {
					if (combinedRemainingCount <= 0) break;

					try {
						// Construct absolute path for matched file
						const fullPath = join(basePath, file);
						// Security validation for each matched file
						const validatedFile = securityValidator.validatePath(fullPath);
						log.info(`Processing file: ${validatedFile}`);

						const fileContent = `filename:${validatedFile}:\n${await Bun.file(
							validatedFile,
						).text()}\n`;
						const processed = await processContent(
							fileContent,
							combinedRemainingCount,
						);

						if (processed.truncated) {
							log.warn(
								`Content truncated for ${validatedFile} due to length limit`,
							);
						}

						combinedContent += processed.content;
						combinedRemainingCount = processed.remainingLength;
						processedFiles++;
					} catch (error) {
						if (error instanceof SecurityError) {
							log.error(`Security error for file ${file}: ${error.message}`);
							combinedContent += `[Security Error accessing file: ${file}]\n`;
						} else {
							log.warn(`Error processing file ${file}: ${error}`);
							combinedContent += `[Error reading file: ${file}]\n`;
						}
					}
				}

				return {
					operationResults: result.replace(match, combinedContent),
					combinedRemainingCount,
				};
			} catch (error) {
				log.error(`Error processing glob ${path}: ${error}`);
				return {
					operationResults: result.replace(
						match,
						`[Error executing glob pattern: ${path}]`,
					),
					combinedRemainingCount: remainingLength,
				};
			}
		} catch (error) {
			log.error(`Invalid glob pattern ${path}: ${error}`);
			return {
				operationResults: result.replace(
					match,
					`[Invalid glob pattern: ${path}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}
	} catch (error) {
		log.error(`Invalid glob pattern ${path}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Invalid glob pattern: ${path}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
