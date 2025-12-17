import { isAbsolute, resolve } from "node:path";
import { getLogger } from "./logger";
import { SecurityError, securityValidator } from "./security";

const log = getLogger("function");

export const FUNCTION_TEMPLATE = "TemplateType.Function:";

export const handleFunction = async (
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath?: string,
) => {
	if (remainingLength <= 0) {
		return {
			operationResults: result,
			combinedRemainingCount: remainingLength,
		};
	}

	let functionPath = path.split(FUNCTION_TEMPLATE)[1];

	// Resolve relative paths using the provided basePath
	if (basePath && !isAbsolute(functionPath)) {
		functionPath = resolve(basePath, functionPath);
	}

	try {
		// Security validation
		const validatedPath = securityValidator.validateFunction(functionPath);

		log.info(`Executing function: ${validatedPath}`);

		const functionModule = await import(validatedPath);

		// Validate that the module has a default export that's a function
		if (typeof functionModule.default !== "function") {
			throw new Error(
				`Function module must export a default function: ${validatedPath}`,
			);
		}

		const { operationResults, combinedRemainingCount } =
			await functionModule.default(result, path, match, remainingLength);

		// Validate the return value
		if (typeof operationResults !== "string") {
			throw new Error(
				`Function must return a string as operationResults: ${validatedPath}`,
			);
		}

		if (typeof combinedRemainingCount !== "number") {
			throw new Error(
				`Function must return a number as combinedRemainingCount: ${validatedPath}`,
			);
		}

		return {
			operationResults,
			combinedRemainingCount,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(
				`Security error for function ${functionPath}: ${error.message}`,
			);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to execute function ${functionPath}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Error executing function: ${error}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
