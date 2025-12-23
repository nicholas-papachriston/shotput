import { join } from "node:path";
import { type ShotputConfig, createConfig } from "./config";
import { ensureDirectoryExists } from "./directory";
import { interpolation } from "./interpolation";
import { getLogger } from "./logger";

const log = getLogger("shotput");

export interface ShotputOutput {
	content?: string;
	error?: Error;
	metadata: {
		duration: number;
		resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	};
}

const run = async (config: ShotputConfig): Promise<ShotputOutput> => {
	const startTime = Date.now();
	try {
		await ensureDirectoryExists(config.responseDir, config.templateDir);

		// Use provided template content or read from file
		let templateContent: string;
		if (config.template !== undefined) {
			templateContent = config.template;
		} else {
			const templatePath = join(config.templateDir, config.templateFile);
			templateContent = await Bun.file(templatePath).text();
		}

		const { processedTemplate, resultMetadata } = await interpolation(
			templateContent,
			config,
			config.templateDir,
		);

		const duration = Date.now() - startTime;
		const resultObject = {
			content: processedTemplate,
			metadata: { duration, resultMetadata },
		};

		if (config.debug) {
			await Bun.write(config.debugFile, processedTemplate);
			log.info(`Debug output written to ${config.debugFile}`);
		}

		return resultObject;
	} catch (error) {
		log.error(`Failed to process template: ${error}`);
		return {
			error: error as Error,
			metadata: { duration: Date.now() - startTime, resultMetadata: [] },
		};
	}
};

/**
 * Create a new Shotput instance with optional configuration overrides.
 *
 * @param config - Partial configuration to override defaults
 *
 * @example
 * ```ts
 * // Use with file-based template
 * const template = shotput({
 *   debug: true,
 *   allowHttp: true,
 *   allowedDomains: ['api.example.com']
 * }).then(console.log).catch(console.error);
 * ```
 *
 * @example
 * ```ts
 * // Use with inline template content
 * const template = shotput({
 *   template: 'Hello {{./data.txt}}!',
 *   templateDir: '/path/to/base',
 *   allowedBasePaths: ['/path/to/base']
 * }).then(console.log).catch(console.error);
 * ```
 */
export function shotput(
	configOverrides?: Partial<ShotputConfig>,
): Promise<ShotputOutput> {
	const config = createConfig(configOverrides);
	return run(config);
}

if (require.main === module) {
	shotput().catch(console.error);
}
