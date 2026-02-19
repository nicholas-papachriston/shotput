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
		0,
		config.maxPromptLength,
		new Set(),
		undefined,
		undefined,
		true, // rules already evaluated above
	);

	return {
		stream: streamResult.stream,
		metadata: streamResult.metadata,
		literalMap: streamResult.literalMap,
		literalMapPromise: streamResult.literalMapPromise,
		subagentFrontmatter,
	};
}

export type { ShotputConfig } from "./config";
export type {
	MessageOutput,
	OutputMode,
	Section,
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "./types";
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
 * Process a Shotput template and return the resolved content.
 *
 * @param configOverrides - Partial configuration. Omit to use env vars and defaults.
 *   Use `template` for inline content, or `templateFile` for file-based templates.
 *   Set `outputMode: "sectioned"` or `"messages"` when using `{{#section:name}}` blocks.
 * @returns Resolved content, sections, or messages depending on outputMode.
 *   Check `result.error` if processing threw.
 *
 * @example
 * ```ts
 * const result = await shotput({
 *   template: "Hello {{./data.txt}}!",
 *   templateDir: "./data",
 *   allowedBasePaths: ["./data"],
 * });
 * console.log(result.content);
 * ```
 *
 * @example
 * ```ts
 * const result = await shotput({
 *   templateDir: "./templates",
 *   templateFile: "prompt.md",
 *   outputMode: "messages",
 *   sectionRoles: { system: "system", context: "user" },
 * });
 * console.log(result.messages);
 * ```
 */
export function shotput(
	configOverrides?: Partial<ShotputConfig>,
): Promise<ShotputOutput> {
	return run(buildConfig(configOverrides));
}

/**
 * Stream resolved segments in document order as each placeholder is resolved.
 *
 * Runs template load, preResolve hooks, and rules. PostAssembly, preOutput, and
 * sectioning are not run. Use when you need incremental output for large templates.
 *
 * @param configOverrides - Partial configuration (same as shotput).
 * @returns Stream of string segments and metadata promise.
 *
 * @example
 * ```ts
 * const { stream, metadata } = await shotputStreaming({ template, templateDir, allowedBasePaths });
 * // Consume stream via stream.getReader() and read(); metadata resolves when stream ends.
 * ```
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
 * Stream segments in document order as each placeholder is resolved.
 *
 * Same as shotputStreaming but also returns literalMap and literalMapPromise.
 * Use literalMap when custom sources emit literal placeholders for client-side
 * substitution after concatenating the stream.
 *
 * @param configOverrides - Partial configuration (same as shotput).
 * @returns Stream, metadata promise, optional literalMap and literalMapPromise.
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
