import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { handlerErrorResult } from "./handlerResult";
import { getLogger } from "./logger";
import type { SourcePlugin } from "./sources/plugins";

const log = getLogger("custom");

export const handleCustomSource = async (
	plugin: SourcePlugin,
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath: string,
): Promise<{
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
	mergeContext?: Record<string, unknown>;
}> => {
	log.info(`Handling custom source [${plugin.name}]: ${path}`);

	try {
		const ctx = {
			rawPath: path,
			resolvedPath: path,
			config,
			remainingLength,
			match,
			basePath,
		};
		const resolution = await plugin.resolve(ctx);
		const processed = await processContent(
			resolution.content,
			remainingLength,
			config,
		);

		if (processed.truncated) {
			log.warn(
				`Custom source [${plugin.name}] content truncated for ${path} due to length limit`,
			);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
			replacement: processed.content,
			mergeContext: resolution.mergeContext,
		};
	} catch (error) {
		log.error(
			`Failed to resolve custom source [${plugin.name}] ${path}: ${error}`,
		);
		return handlerErrorResult(result, match, remainingLength, error, {
			path,
		});
	}
};
