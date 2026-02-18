import { SecurityError } from "./security";

export interface HandlerErrorOptions {
	/** Path or context for default error message, e.g. "[Error reading ${path}]" */
	path?: string;
	/** Full error message override, e.g. "[Error: Request Timeout]" or "[Error fetching ${path}]" */
	message?: string;
}

/**
 * Build standard handler error result: SecurityError -> [Security Error: ...],
 * else use options.message, or options.path for "[Error reading ${path}]".
 * When match is empty (e.g. recursive call), operationResults is the message only.
 */
export const handlerErrorResult = (
	result: string,
	match: string,
	remainingLength: number,
	error: unknown,
	options?: HandlerErrorOptions,
): {
	operationResults: string;
	combinedRemainingCount: number;
} => {
	let msg: string;
	if (error instanceof SecurityError) {
		msg = `[Security Error: ${error.message}]`;
	} else if (options?.message) {
		msg = options.message;
	} else if (options?.path) {
		msg = `[Error reading ${options.path}]`;
	} else {
		msg = `[Error: ${String(error)}]`;
	}

	const operationResults = match ? result.replace(match, msg) : msg;

	return {
		operationResults,
		combinedRemainingCount: remainingLength,
	};
};
