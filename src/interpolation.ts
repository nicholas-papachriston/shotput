import { isAbsolute, resolve } from "node:path";
import { CONFIG } from "./config";
import { handleDirectory } from "./directory";
import { handleFile } from "./file";
import { handleGlob } from "./glob";
import { handleS3 } from "./s3";
import { findTemplateType } from "./template";
import { TemplateType } from "./types";

const resolvePath = (basePath: string, filePath: string): string =>
	isAbsolute(filePath) ? filePath : resolve(basePath, filePath);

export const interpolation = async (
	content: string,
	basePath: string = process.cwd(),
): Promise<string> => {
	const pattern = /\{\{([^}]+)\}\}/g;
	const matches = content.match(pattern);
	if (!matches) return content;

	let remainingLength = CONFIG.maxPromptLength;
	let result = content;

	for (const match of matches) {
		const path = resolvePath(basePath, match.slice(2, -2).trim());

		try {
			switch (await findTemplateType(path)) {
				case TemplateType.File: {
					const { operationResults, combinedRemainingCount } =
						await handleDirectory(result, path, match, remainingLength);
					remainingLength = combinedRemainingCount;
					result += operationResults;
					continue;
				}
				case TemplateType.Directory: {
					const { operationResults, combinedRemainingCount } = await handleFile(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result += operationResults;
					continue;
				}
				case TemplateType.Glob: {
					const { operationResults, combinedRemainingCount } = await handleGlob(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result += operationResults;
					continue;
				}
				case TemplateType.Regex: {
					const { operationResults, combinedRemainingCount } = await handleGlob(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result += operationResults;
					continue;
				}
				case TemplateType.S3: {
					const { operationResults, combinedRemainingCount } = await handleS3(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result += operationResults;
					continue;
				}
			}
		} catch (err) {
			console.error(`Failed to read path ${path}:`, err);
			result = result.replace(match, `[Error reading ${path}]`);
		}
	}

	return result.trim();
};
