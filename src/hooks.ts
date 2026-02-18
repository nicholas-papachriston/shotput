import type { ShotputOutput, TemplateResult, TemplateType } from "./types";

export class HookAbortError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HookAbortError";
	}
}

export type PreResolveHook = (template: string) => Promise<string> | string;

export interface SourceResult {
	type: TemplateType;
	path: string;
	content: string;
	remainingLength: number;
	metadata: TemplateResult;
}

export type PostResolveSourceHook = (
	result: SourceResult,
) => Promise<SourceResult> | SourceResult;

export interface AssemblyContext {
	content: string;
	metadata: TemplateResult[];
	remainingLength: number;
}

export type PostAssemblyHook = (
	ctx: AssemblyContext,
) => Promise<AssemblyContext | false> | AssemblyContext | false;

export type PreOutputHook = (
	output: ShotputOutput,
) => Promise<ShotputOutput | false> | ShotputOutput | false;

export interface HookSet {
	preResolve?: PreResolveHook | PreResolveHook[];
	postResolveSource?: PostResolveSourceHook | PostResolveSourceHook[];
	postAssembly?: PostAssemblyHook | PostAssemblyHook[];
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
