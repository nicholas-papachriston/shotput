import type { ShotputOutput, TemplateResult, TemplateType } from "./types";

/**
 * Thrown when a hook aborts the pipeline by returning false.
 * postAssembly and preOutput hooks can abort; shotput returns output with error set.
 */
export class HookAbortError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HookAbortError";
	}
}

/**
 * Runs before rules and interpolation. Receives raw template string.
 * Return modified template. Use for pre-processing (e.g. variable injection).
 */
export type PreResolveHook = (template: string) => Promise<string> | string;

/**
 * Per-source result passed to postResolveSource hooks.
 */
export interface SourceResult {
	type: TemplateType;
	path: string;
	content: string;
	remainingLength: number;
	metadata: TemplateResult;
}

/**
 * Runs after each source is resolved, before concatenation.
 * Receives SourceResult; return modified result. Use for per-source transforms (e.g. token counting).
 */
export type PostResolveSourceHook = (
	result: SourceResult,
) => Promise<SourceResult> | SourceResult;

/**
 * Context passed to postAssembly hook: full content and metadata before sectioning.
 */
export interface AssemblyContext {
	content: string;
	metadata: TemplateResult[];
	remainingLength: number;
}

/**
 * Runs after interpolation, before section parsing.
 * Receive AssemblyContext; return modified context or false to abort.
 * Use for global transforms (e.g. PII redaction, LLM-based compression).
 */
export type PostAssemblyHook = (
	ctx: AssemblyContext,
) => Promise<AssemblyContext | false> | AssemblyContext | false;

/**
 * Runs after sectioning, before returning output.
 * Receive ShotputOutput; return modified output or false to abort.
 * Use for final tweaks (e.g. formatting, validation).
 */
export type PreOutputHook = (
	output: ShotputOutput,
) => Promise<ShotputOutput | false> | ShotputOutput | false;

/**
 * Lifecycle hooks for the shotput pipeline.
 * Register via config.hooks. Hooks run in order; postAssembly and preOutput can abort by returning false.
 *
 * Pipeline order: preResolve -> rules -> resolve sources -> postResolveSource (per source) ->
 * concatenate -> postAssembly -> section parse -> preOutput -> return.
 */
export interface HookSet {
	/** Before rules and interpolation */
	preResolve?: PreResolveHook | PreResolveHook[];
	/** After each source is resolved */
	postResolveSource?: PostResolveSourceHook | PostResolveSourceHook[];
	/** After full content assembled, before section parse. Return false to abort. */
	postAssembly?: PostAssemblyHook | PostAssemblyHook[];
	/** After sectioning, before return. Return false to abort. */
	preOutput?: PreOutputHook | PreOutputHook[];
}

function toArray<T>(v: T | T[] | undefined): T[] {
	if (v === undefined) return [];
	return Array.isArray(v) ? v : [v];
}

export async function runPreResolveHooks(
	template: string,
	hooks: PreResolveHook[],
): Promise<string> {
	let result = template;
	for (const hook of hooks) {
		result = await Promise.resolve(hook(result));
	}
	return result;
}

export async function runPostResolveSourceHooks(
	result: SourceResult,
	hooks: PostResolveSourceHook[],
): Promise<SourceResult> {
	let current = result;
	for (const hook of hooks) {
		current = await Promise.resolve(hook(current));
	}
	return current;
}

export async function runPostAssemblyHooks(
	ctx: AssemblyContext,
	hooks: PostAssemblyHook[],
): Promise<AssemblyContext | false> {
	let current: AssemblyContext | false = ctx;
	for (const hook of hooks) {
		current = await Promise.resolve(hook(current as AssemblyContext));
		if (current === false) return false;
	}
	return current;
}

export async function runPreOutputHooks(
	output: ShotputOutput,
	hooks: PreOutputHook[],
): Promise<ShotputOutput | false> {
	let current: ShotputOutput | false = output;
	for (const hook of hooks) {
		current = await Promise.resolve(hook(current as ShotputOutput));
		if (current === false) return false;
	}
	return current;
}

export function getHooks(config: { hooks?: HookSet }): HookSet | undefined {
	return config.hooks;
}

export function getPreResolveHooks(config: {
	hooks?: HookSet;
}): PreResolveHook[] {
	return toArray(getHooks(config)?.preResolve);
}

export function getPostResolveSourceHooks(config: {
	hooks?: HookSet;
}): PostResolveSourceHook[] {
	return toArray(getHooks(config)?.postResolveSource);
}

export function getPostAssemblyHooks(config: {
	hooks?: HookSet;
}): PostAssemblyHook[] {
	return toArray(getHooks(config)?.postAssembly);
}

export function getPreOutputHooks(config: {
	hooks?: HookSet;
}): PreOutputHook[] {
	return toArray(getHooks(config)?.preOutput);
}
