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
import { interpolationStream } from "./interpolationStream";
import { getLogger } from "./logger";
import { parseAllBlocks } from "./ruleBlocks";
import { evaluateRules } from "./rules";
import { formatMessages, parseOutputSections } from "./sections";
import { consumeStreamToString } from "./streamUtils";
import { createSubagentPlugin, parseSubagentFrontmatter } from "./subagent";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "./types";

const log = getLogger("shotput");

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

interface RunStreamingInternalResult {
	stream: ReadableStream<string>;
	metadata: Promise<ShotputOutput["metadata"]>;
	literalMap?: Map<string, string>;
	literalMapPromise?: Promise<Map<string, string> | undefined>;
	subagentFrontmatter?: Record<string, unknown>;
}

async function runStreamingInternal(
	config: ShotputConfig,
): Promise<RunStreamingInternalResult> {
	await ensureDirectoryExists(config.responseDir, config.templateDir);

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

	const streamResult = interpolationStream(
		templateContent,
		config,
		config.templateDir,
	);

	return {
		stream: streamResult.stream,
		metadata: streamResult.metadata,
		literalMap: streamResult.literalMap,
		literalMapPromise: streamResult.literalMapPromise,
		subagentFrontmatter,
	};
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
		const { stream, metadata, subagentFrontmatter } =
			await runStreamingInternal(config);
		const processedTemplate = await consumeStreamToString(stream);
		const resolvedMetadata = await metadata;
		const duration = Date.now() - startTime;
		const resultMetadata = resolvedMetadata.resultMetadata ?? [];
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
					metadata: resultMetadata.map((m) => ({
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
 * Pre-compile a template for repeated renders. Warms the block parse cache and returns
 * a render function that accepts config overrides (e.g. context). Use when rendering
 * the same template many times with varying context.
 *
 * @param template - Template string
 * @param baseConfig - Base configuration (templateDir, allowedBasePaths, context, etc.)
 * @returns Async render function that merges baseConfig with overrides and runs shotput
 *
 * @example
 * ```ts
 * const compiled = compileShotputTemplate(template, { templateDir, allowedBasePaths });
 * const out1 = await compiled({ context: { items: [...] } });
 * const out2 = await compiled({ context: { items: [...] } }); // reuses cached parse
 * ```
 */
export function compileShotputTemplate(
	template: string,
	baseConfig?: Partial<ShotputConfig>,
): (
	configOverrides?: Partial<ShotputConfig>,
) => Promise<import("./types").ShotputOutput> {
	parseAllBlocks(template);
	return (configOverrides?: Partial<ShotputConfig>) =>
		shotput({
			...baseConfig,
			template,
			...configOverrides,
		});
}

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
 * Run template load, preResolve hooks, and rules, then stream segments in document order
 * as each placeholder is resolved. Same stream as shotputStreamingSegments; postAssembly,
 * preOutput, and sectioning are not run.
 */
export async function shotputStreaming(
	configOverrides?: Partial<ShotputConfig>,
): Promise<ShotputStreamingOutput> {
	const config = buildConfig(configOverrides);
	const startTime = Date.now();
	try {
		const { stream, metadata } = await runStreamingInternal(config);
		const resolvedMetadata = metadata.then((m) => ({
			...m,
			duration: Date.now() - startTime,
		}));
		return {
			stream,
			metadata: resolvedMetadata,
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
		const { stream, metadata, literalMap, literalMapPromise } =
			await runStreamingInternal(config);
		const resolvedMetadata = metadata.then((m) => ({
			...m,
			duration: Date.now() - startTime,
		}));
		return {
			stream,
			metadata: resolvedMetadata,
			literalMap,
			literalMapPromise,
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
