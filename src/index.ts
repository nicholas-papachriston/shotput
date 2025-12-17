import { join } from "node:path";
import { CONFIG } from "./config";
import { ensureDirectoryExists } from "./directory";
import { interpolation } from "./interpolation";
import { getLogger } from "./logger";
import { securityValidator } from "./security";

const log = getLogger("shotput");

export interface ShotputOutput {
	content?: string;
	error?: Error;
	metadata: {
		duration: number;
		resultMetadata?: Array<{ path: string; type: string; duration: number }>;
	};
}

const run = async (): Promise<ShotputOutput> => {
	const startTime = Date.now();
	try {
		// Initialize security configuration using current CONFIG
		securityValidator.configure(CONFIG);

		await ensureDirectoryExists(CONFIG.responseDir, CONFIG.templateDir);

		// Use provided template content or read from file
		let templateContent: string;
		if (CONFIG.template !== undefined) {
			templateContent = CONFIG.template;
		} else {
			const templatePath = join(CONFIG.templateDir, CONFIG.templateFile);
			templateContent = await Bun.file(templatePath).text();
		}

		const { processedTemplate, resultMetadata } = await interpolation(
			templateContent,
			CONFIG.templateDir,
		);

		const duration = Date.now() - startTime;
		const resultObject = {
			content: processedTemplate,
			metadata: { duration, resultMetadata },
		};

		if (CONFIG.debug) {
			await Bun.write(CONFIG.debugFile, processedTemplate);
			log.info(`Debug output written to ${CONFIG.debugFile}`);
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
	config?: Partial<typeof CONFIG>,
): Promise<ShotputOutput> {
	// Reset per-call template content to prevent state leakage between runs
	CONFIG.template = undefined;

	if (config) {
		// Update global CONFIG with provided values, ignoring undefined ones
		for (const [key, value] of Object.entries(config)) {
			if (value !== undefined) {
				(CONFIG as Record<string, unknown>)[key] = value;
			}
		}
	}

	return run();
}

if (require.main === module) {
	shotput().catch(console.error);
}
