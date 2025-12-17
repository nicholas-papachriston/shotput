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
}

const run = async (): Promise<ShotputOutput> => {
	try {
		// Initialize security configuration
		securityValidator.configure({
			allowedBasePaths: CONFIG.allowedBasePaths,
			allowedDomains: CONFIG.allowedDomains,
			allowHttp: CONFIG.allowHttp,
			allowFunctions: CONFIG.allowFunctions,
			allowedFunctionPaths: CONFIG.allowedFunctionPaths,
		});

		await ensureDirectoryExists(CONFIG.responseDir, CONFIG.templateDir);

		// Use provided template content or read from file
		let templateContent: string;
		if (CONFIG.template !== undefined) {
			templateContent = CONFIG.template;
		} else {
			const templatePath = join(CONFIG.templateDir, CONFIG.templateFile);
			templateContent = await Bun.file(templatePath).text();
		}

		const processedTemplate = await interpolation(
			templateContent,
			CONFIG.templateDir,
		);

		if (CONFIG.debug) {
			await Bun.write(CONFIG.debugFile, processedTemplate);
			log.info(`Debug output written to ${CONFIG.debugFile}`);
		}

		return { content: processedTemplate };
	} catch (error) {
		log.error(`Failed to process template: ${error}`);
		return { error: error as Error };
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
	if (config) {
		// Only allow specific configuration properties for security
		Object.assign(CONFIG, {
			debug: config.debug,
			debugFile: config.debugFile,
			template: config.template,
			templateDir: config.templateDir,
			templateFile: config.templateFile,
			responseDir: config.responseDir,
			maxPromptLength: config.maxPromptLength,
			maxBucketFiles: config.maxBucketFiles,
			awsS3Url: config.awsS3Url,
			cloudflareR2Url: config.cloudflareR2Url,
			httpTimeout: config.httpTimeout,
			maxConcurrency: config.maxConcurrency,
			allowedBasePaths: config.allowedBasePaths,
			allowedDomains: config.allowedDomains,
			allowHttp: config.allowHttp,
			allowFunctions: config.allowFunctions,
			allowedFunctionPaths: config.allowedFunctionPaths,
			skillsDir: config.skillsDir,
			allowRemoteSkills: config.allowRemoteSkills,
			allowedSkillSources: config.allowedSkillSources,
			s3AccessKeyId: config.s3AccessKeyId,
			s3SecretAccessKey: config.s3SecretAccessKey,
			s3SessionToken: config.s3SessionToken,
			s3Region: config.s3Region,
			s3Bucket: config.s3Bucket,
			s3VirtualHostedStyle: config.s3VirtualHostedStyle,
		});
	}

	return run();
}

if (require.main === module) {
	shotput().catch(console.error);
}
