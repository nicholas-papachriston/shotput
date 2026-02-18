import { join } from "node:path";
import { createCommandPlugin } from "./command";
import { type ShotputConfig, createConfig } from "./config";
import { ensureDirectoryExists } from "./directory";
import {
	HookAbortError,
	getPostAssemblyHooks,
	getPreOutputHooks,
	getPreResolveHooks,
	runPostAssemblyHooks,
	runPreOutputHooks,
	runPreResolveHooks,
} from "./hooks";
import { interpolation } from "./interpolation";
import { interpolationStream } from "./interpolationStream";
import { getLogger } from "./logger";
import { evaluateRules } from "./rules";
import { formatMessages, parseOutputSections } from "./sections";
import { createSubagentPlugin, parseSubagentFrontmatter } from "./subagent";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "./types";

const log = getLogger("shotput");

const STREAM_CHUNK_SIZE = 64 * 1024;

function buildConfig(configOverrides?: Partial<ShotputConfig>): ShotputConfig {
	let config = createConfig(configOverrides);
	const customPlugins: import("./plugins").SourcePlugin[] = [
		...(config.customSources ?? []),
	];
	if (config.commandsDir) {
		customPlugins.unshift(createCommandPlugin());
	}
	if (config.subagentsDir) {
		customPlugins.unshift(createSubagentPlugin());
	}
	if (customPlugins.length > 0) {
		config = { ...config, customSources: customPlugins };
	}
	return config;
}

function contentToStream(content: string): ReadableStream<string> {
	return new ReadableStream({
		start(controller) {
			let offset = 0;
			while (offset < content.length) {
				const chunk = content.slice(
					offset,
					Math.min(offset + STREAM_CHUNK_SIZE, content.length),
				);
				controller.enqueue(chunk);
				offset += chunk.length;
			}
			controller.close();
		},
	});
}

export type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
};
export { HookAbortError } from "./hooks";
export type {
	HookSet,
	PreResolveHook,
	PostResolveSourceHook,
	PostAssemblyHook,
	PreOutputHook,
	SourceResult,
	AssemblyContext,
} from "./hooks";

const run = async (config: ShotputConfig): Promise<ShotputOutput> => {
	const startTime = Date.now();
	try {
		await ensureDirectoryExists(config.responseDir, config.templateDir);

		// Use provided template content or read from file
		let templateContent: string;
		let subagentFrontmatter: Record<string, unknown> | undefined;
		if (config.template !== undefined) {
			templateContent = config.template;
			if (config.parseSubagentFrontmatter) {
				const parsed = parseSubagentFrontmatter(templateContent);
				if (parsed) {
					templateContent = parsed.body;
					subagentFrontmatter = parsed.frontmatter as Record<string, unknown>;
				}
			}
		} else {
			const templatePath = join(config.templateDir, config.templateFile);
			templateContent = await Bun.file(templatePath).text();
			if (config.parseSubagentFrontmatter) {
				const parsed = parseSubagentFrontmatter(templateContent);
				if (parsed) {
					templateContent = parsed.body;
					subagentFrontmatter = parsed.frontmatter as Record<string, unknown>;
				}
			}
		}

		const preResolveHooks = getPreResolveHooks(config);
		if (preResolveHooks.length > 0) {
			templateContent = await runPreResolveHooks(
				templateContent,
				preResolveHooks,
			);
		}

		templateContent = evaluateRules(templateContent, config);

		const { processedTemplate, resultMetadata } = await interpolation(
			templateContent,
			config,
			config.templateDir,
		);

		const duration = Date.now() - startTime;
		const outputMode = config.outputMode ?? "flat";
		let resultObject: ShotputOutput = {
			content: processedTemplate,
			metadata: { duration, resultMetadata, outputMode },
		};
		if (subagentFrontmatter !== undefined) {
			resultObject = { ...resultObject, frontmatter: subagentFrontmatter };
		}

		const postAssemblyHooks = getPostAssemblyHooks(config);
		if (postAssemblyHooks.length > 0) {
			const assemblyResult = await runPostAssemblyHooks(
				{
					content: processedTemplate,
					metadata: (resultMetadata ?? []).map((m) => ({
						type: m.type as import("./types").TemplateType,
						path: m.path,
						length: 0,
						truncated: false,
						processingTime: m.duration,
					})),
					remainingLength: config.maxPromptLength - processedTemplate.length,
				},
				postAssemblyHooks,
			);
			if (assemblyResult === false) {
				return {
					error: new HookAbortError("postAssembly hook aborted"),
					metadata: { duration: Date.now() - startTime, resultMetadata: [] },
				};
			}
			resultObject = {
				...resultObject,
				content: assemblyResult.content,
			};
		}

		if (outputMode === "sectioned" || outputMode === "messages") {
			const { sections, remainingContent } = parseOutputSections(
				resultObject.content ?? "",
				config.sectionBudgets,
			);
			if (outputMode === "sectioned") {
				resultObject = {
					...resultObject,
					sections,
					content: remainingContent || resultObject.content,
				};
			} else {
				const sectionRoles = config.sectionRoles ?? {};
				resultObject = {
					...resultObject,
					messages: formatMessages(sections, sectionRoles),
					content: remainingContent || resultObject.content,
				};
			}
		}

		const preOutputHooks = getPreOutputHooks(config);
		if (preOutputHooks.length > 0) {
			const outputResult = await runPreOutputHooks(
				resultObject,
				preOutputHooks,
			);
			if (outputResult === false) {
				return {
					error: new HookAbortError("preOutput hook aborted"),
					metadata: { duration: Date.now() - startTime, resultMetadata: [] },
				};
			}
			resultObject = outputResult;
		}

		if (config.debug) {
			await Bun.write(config.debugFile, resultObject.content ?? "");
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
	return run(buildConfig(configOverrides));
}

/**
 * Run the same pipeline as shotput but return the final content as a ReadableStream.
 * Callers can pipe the stream to fetch(), write to a file, or consume in chunks.
 */
export async function shotputStreaming(
	configOverrides?: Partial<ShotputConfig>,
): Promise<ShotputStreamingOutput> {
	const output = await run(buildConfig(configOverrides));
	if (output.error) {
		return {
			stream: new ReadableStream<string>({
				start(c) {
					c.close();
				},
			}),
			metadata: output.metadata,
			error: output.error,
		};
	}
	const content = output.content ?? "";
	return {
		stream: contentToStream(content),
		metadata: output.metadata,
	};
}

/**
 * Run template load, preResolve hooks, and rules, then stream segments in document order
 * as each placeholder is resolved. PostAssembly, preOutput, and sectioning are not run;
 * consumers can concatenate the stream and run hooks if needed. literalMap can be used
 * for client-side substituteLiterals when custom sources emit literal placeholders.
 */
export async function shotputStreamingSegments(
	configOverrides?: Partial<ShotputConfig>,
): Promise<ShotputSegmentStreamOutput> {
	const config = buildConfig(configOverrides);
	const startTime = Date.now();
	try {
		await ensureDirectoryExists(config.responseDir, config.templateDir);

		let templateContent: string;
		if (config.template !== undefined) {
			templateContent = config.template;
		} else {
			const templatePath = join(config.templateDir, config.templateFile);
			templateContent = await Bun.file(templatePath).text();
		}

		const preResolveHooks = getPreResolveHooks(config);
		if (preResolveHooks.length > 0) {
			templateContent = await runPreResolveHooks(
				templateContent,
				preResolveHooks,
			);
		}

		const streamResult = await interpolationStream(
			templateContent,
			config,
			config.templateDir,
		);

		const baseMetadata = streamResult.metadata;
		const metadata: Promise<ShotputOutput["metadata"]> = baseMetadata.then(
			(m) => ({
				...m,
				duration: Date.now() - startTime,
			}),
		);

		return {
			stream: streamResult.stream,
			metadata,
			literalMap: streamResult.literalMap,
		};
	} catch (error) {
		log.error(`Failed to process template: ${error}`);
		return {
			stream: new ReadableStream<string>({
				start(c) {
					c.close();
				},
			}),
			metadata: Promise.resolve({
				duration: Date.now() - startTime,
				resultMetadata: [],
			}),
			error: error as Error,
		};
	}
}

export type { SourceContext, SourcePlugin, SourceResolution } from "./plugins";
export { resolveSubagent } from "./subagent";
export type { ResolvedSubagent, SubagentConfig } from "./subagent";

if (require.main === module) {
	shotput().catch(console.error);
}
