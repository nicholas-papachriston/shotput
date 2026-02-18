import { isAbsolute, resolve } from "node:path";
import type { ShotputConfig } from "./config";
import { handlerErrorResult } from "./handlerResult";
import { getLogger } from "./logger";
import { SecurityError, validateFunction } from "./security";

const log = getLogger("function");

export const FUNCTION_TEMPLATE = "TemplateType.Function:";

/**
 * Handles custom function interpolation by dynamically importing and executing a JavaScript function.
 *
 * @param config - The current shotput configuration
 * @param result - The current template content
 * @param path - The path to the function file
 * @param match - The original template marker
 * @param remainingLength - The character budget remaining for this run
 * @param basePath - The base directory for resolving relative paths
 */
export const handleFunction = async (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath: string,
): Promise<{ operationResults: string; combinedRemainingCount: number }> => {
	log.info(`Executing function: ${path}`);

	try {
		// Remove the prefix if present to get the actual file path
		const functionPath = path.startsWith(FUNCTION_TEMPLATE)
			? path.slice(FUNCTION_TEMPLATE.length)
			: path;

		// Resolve path relative to the base path if it's not absolute
		const resolvedPath = isAbsolute(functionPath)
			? functionPath
			: resolve(basePath, functionPath);

		// Security validation to ensure the function is allowed to run
		validateFunction(config, resolvedPath);

		// Import the function module
		const module = await import(resolvedPath);
		const fn = module.default || module;

		if (typeof fn !== "function") {
			throw new Error(`Default export of ${resolvedPath} is not a function`);
		}

		// Execute the function. It should return { operationResults, combinedRemainingCount }
		const functionResult = await fn(result, path, match, remainingLength);

		if (
			!functionResult ||
			typeof functionResult !== "object" ||
			!("operationResults" in functionResult)
		) {
			throw new Error(`Function ${path} did not return expected result format`);
		}

		return {
			operationResults: functionResult.operationResults,
			combinedRemainingCount:
				functionResult.combinedRemainingCount ?? remainingLength,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error for function ${path}: ${error.message}`);
		} else {
			log.error(`Failed to execute function ${path}: ${error}`);
		}
		return handlerErrorResult(result, match, remainingLength, error, {
			message: `[Error executing function ${path}]`,
		});
	}
};
