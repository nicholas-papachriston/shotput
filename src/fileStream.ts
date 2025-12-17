import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, securityValidator } from "./security";

const log = getLogger("fileStream");

export const handleFileStream = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
) => {
	log.info(`Handling file stream: ${path}`);

	try {
		// Security validation
		const validatedPath = securityValidator.validatePath(path);

		// Check if file exists and is accessible
		const file = Bun.file(validatedPath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`File not found: ${validatedPath}`);
		}

		// Stream processing for large files
		const stream = file.stream();
		const decoder = new TextDecoder("utf-8");
		let processedContent = "";
		let totalLength = 0;

		for await (const chunk of stream) {
			const chunkText = decoder.decode(chunk, { stream: true });

			if (totalLength + chunkText.length > remainingLength) {
				const remainingChars = remainingLength - totalLength;
				if (remainingChars > 0) {
					processedContent += chunkText.slice(0, remainingChars);
					totalLength = remainingLength;
				}
				break;
			}

			processedContent += chunkText;
			totalLength += chunkText.length;

			if (totalLength >= remainingLength) {
				break;
			}
		}

		const fileContent = `filename:${validatedPath}:\n${processedContent}`;
		const processed = await processContent(fileContent, remainingLength);

		if (processed.truncated) {
			log.warn(`Content truncated for ${validatedPath} due to length limit`);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for ${path}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to read file ${path}: ${error}`);
		return {
			operationResults: result.replace(match, `[Error reading ${path}]`),
			combinedRemainingCount: remainingLength,
		};
	}
};
