import { isAbsolute, resolve } from "node:path";
import { CONFIG } from "./config";
import { handleDirectory } from "./directory";
import { handleFile } from "./file";
import { handleFunction } from "./function";
import { handleGlob } from "./glob";
import { handleHttp } from "./http";
import { getLogger } from "./logger";
import { handleS3 } from "./s3";
import { securityValidator } from "./security";
import { handleSkill } from "./skill";
import { findTemplateType } from "./template";
import { TemplateType } from "./types";

const log = getLogger("interpolation");

const pattern = /\{\{([^}]+)\}\}/g;

// Prefixes that should NOT have path resolution applied
const SPECIAL_PREFIXES = [
	"skill:",
	"TemplateType.Function:",
	"http://",
	"https://",
	"s3://",
];

const shouldResolvePath = (filePath: string): boolean => {
	return !SPECIAL_PREFIXES.some((prefix) => filePath.startsWith(prefix));
};

const resolvePath = (basePath: string, filePath: string): string => {
	// Don't resolve paths for special template types
	if (!shouldResolvePath(filePath)) {
		return filePath;
	}
	return isAbsolute(filePath) ? filePath : resolve(basePath, filePath);
};

// Initialize security configuration on first use
let securityInitialized = false;
const initializeSecurity = () => {
	if (!securityInitialized) {
		securityValidator.configure({
			allowedBasePaths: CONFIG.allowedBasePaths,
			allowedDomains: CONFIG.allowedDomains,
			allowHttp: CONFIG.allowHttp,
			allowFunctions: CONFIG.allowFunctions,
			allowedFunctionPaths: CONFIG.allowedFunctionPaths,
		});
		securityInitialized = true;
	}
};

export const interpolation = async (
	content: string,
	basePath: string = process.cwd(),
): Promise<string> => {
	// Initialize security configuration
	initializeSecurity();

	const matches = content.match(pattern);
	if (!matches) return content;

	let remainingLength = CONFIG.maxPromptLength;
	let result = content;

	for (const match of matches) {
		const path = resolvePath(basePath, match.slice(2, -2).trim());

		try {
			const templateType = await findTemplateType(path);

			switch (templateType) {
				case TemplateType.File: {
					const { operationResults, combinedRemainingCount } = await handleFile(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result = operationResults;
					continue;
				}
				case TemplateType.Directory: {
					const { operationResults, combinedRemainingCount } =
						await handleDirectory(result, path, match, remainingLength);
					remainingLength = combinedRemainingCount;
					result = operationResults;
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
					result = operationResults;
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
					result = operationResults;
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
					result = operationResults;
					continue;
				}
				case TemplateType.Http: {
					const { operationResults, combinedRemainingCount } = await handleHttp(
						result,
						path,
						match,
						remainingLength,
					);
					remainingLength = combinedRemainingCount;
					result = operationResults;
					continue;
				}
				case TemplateType.Function: {
					const { operationResults, combinedRemainingCount } =
						await handleFunction(
							result,
							path,
							match,
							remainingLength,
							basePath,
						);
					remainingLength = combinedRemainingCount;
					result = operationResults;
					continue;
				}
				case TemplateType.Skill: {
					const { operationResults, combinedRemainingCount } =
						await handleSkill(result, path, match, remainingLength);
					remainingLength = combinedRemainingCount;
					result = operationResults;
					continue;
				}
				default: {
					log.warn(`Unknown template type: ${templateType} for path: ${path}`);
					continue;
				}
			}
		} catch (err) {
			log.error(`Failed to read path ${path}: ${err}`);
			result = result.replace(match, `[Error reading ${path}]`);
		}
	}

	return result.trim();
};
