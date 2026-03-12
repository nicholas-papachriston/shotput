import { join } from "node:path";
import { type ShotputConfig, createConfig } from "../config";
import { ensureDirectoryExists } from "../directory";
import {
	HookAbortError,
	getPostAssemblyHooks,
	getPreOutputHooks,
	getPreResolveHooks,
	runPostAssemblyHooks,
	runPreOutputHooks,
	runPreResolveHooks,
} from "../hooks";
import type { CompiledJinjaRenderer } from "../language/jinja";
import { renderJinjaTemplate } from "../language/jinja";
import { type Segment, renderSegments } from "../language/shotput/compiledLoop";
import type { RuleContext } from "../language/shotput/ruleConditions";
import { evaluateRules } from "../language/shotput/rules";
import { getLogger } from "../logger";
import { interpolationStream } from "../runtime/interpolationStream";
import { registerBuiltins } from "../sources/registerBuiltins";
import { parseSubagentFrontmatter } from "../sources/subagent";
import { formatMessages, parseOutputSections } from "../support/sections";
import { consumeStreamToString } from "../support/streamUtils";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "../types";

const log = getLogger("shotput");

export interface ConfigWithCompiled extends ShotputConfig {
	_compiledRootSegments?: Segment[];
	_compiledJinjaRenderer?: CompiledJinjaRenderer;
}

/**
 * Build full config from overrides, adding command/subagent plugins when dirs are set.
 */
export function buildConfig(
	configOverrides?: Partial<ShotputConfig> | Partial<ConfigWithCompiled>,
): ShotputConfig {
	let config = createConfig(
		configOverrides as Partial<ShotputConfig> | undefined,
	) as ConfigWithCompiled;
	const customPlugins = registerBuiltins(config);
	if (customPlugins.length > 0) {
		config = { ...config, customSources: customPlugins };
	}
	if (configOverrides && "_compiledRootSegments" in configOverrides) {
		config._compiledRootSegments = (
			configOverrides as ConfigWithCompiled
		)._compiledRootSegments;
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

export async function runStreamingInternal(
	config: ShotputConfig | ConfigWithCompiled,
): Promise<RunStreamingInternalResult> {
	const cfg = config as ConfigWithCompiled;
	await ensureDirectoryExists(cfg.responseDir, cfg.templateDir);

	let templateContent: string;
	let subagentFrontmatter: Record<string, unknown> | undefined;
	if (cfg.template !== undefined) {
		templateContent = cfg.template;
		if (cfg.parseSubagentFrontmatter) {
			const parsed = parseSubagentFrontmatter(templateContent);
			if (parsed) {
				templateContent = parsed.body;
				subagentFrontmatter = parsed.frontmatter as Record<string, unknown>;
			}
		}
	} else {
		const templatePath = join(cfg.templateDir, cfg.templateFile);
		templateContent = await Bun.file(templatePath).text();
		if (cfg.parseSubagentFrontmatter) {
			const parsed = parseSubagentFrontmatter(templateContent);
			if (parsed) {
				templateContent = parsed.body;
				subagentFrontmatter = parsed.frontmatter as Record<string, unknown>;
			}
		}
	}

	const preResolveHooks = getPreResolveHooks(cfg);
	if (preResolveHooks.length > 0) {
		templateContent = await runPreResolveHooks(
			templateContent,
			preResolveHooks,
		);
	}

	const compiledRoot = cfg._compiledRootSegments;
	const compiledJinjaRenderer = cfg._compiledJinjaRenderer;
	if (compiledRoot !== undefined) {
		const context = cfg.context ?? {};
		const env = typeof process !== "undefined" ? process.env : {};
		const params = (cfg as { params?: Record<string, unknown> }).params;
		const ctx: RuleContext = { context, env, params };
		templateContent = renderSegments(compiledRoot, cfg, ctx, undefined);
	} else if (
		cfg.templateSyntax === "jinja2" ||
		compiledJinjaRenderer !== undefined
	) {
		templateContent = await renderJinjaTemplate(
			templateContent,
			cfg,
			compiledJinjaRenderer,
		);
	} else {
		templateContent = evaluateRules(templateContent, cfg);
	}

	const contentFullyEvaluated =
		compiledRoot !== undefined ||
		cfg.templateSyntax === "jinja2" ||
		compiledJinjaRenderer !== undefined;

	const streamResult = interpolationStream(
		templateContent,
		cfg,
		cfg.templateDir,
		0,
		cfg.maxPromptLength,
		new Set(),
		undefined,
		undefined,
		contentFullyEvaluated,
		contentFullyEvaluated,
	);

	return {
		stream: streamResult.stream,
		metadata: streamResult.metadata,
		literalMap: streamResult.literalMap,
		literalMapPromise: streamResult.literalMapPromise,
		subagentFrontmatter,
	};
}

async function runFull(
	config: ShotputConfig | ConfigWithCompiled,
): Promise<ShotputOutput> {
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
						type: m.type as import("../types").TemplateType,
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
}

/**
 * Run full shotput pipeline (postAssembly, preOutput, sectioning). Use for promise-based API.
 */
export function runShotput(
	configOverrides?: Partial<ShotputConfig> | Partial<ConfigWithCompiled>,
): Promise<ShotputOutput> {
	return runFull(buildConfig(configOverrides));
}

/**
 * Stream resolved segments; postAssembly, preOutput, and sectioning are not run.
 */
export async function runShotputStreaming(
	configOverrides?: Partial<ShotputConfig> | Partial<ConfigWithCompiled>,
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
 * Stream segments with literalMap/literalMapPromise for client-side substitution.
 */
export async function runShotputStreamingSegments(
	configOverrides?: Partial<ShotputConfig> | Partial<ConfigWithCompiled>,
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
