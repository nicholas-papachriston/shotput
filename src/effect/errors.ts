import { HookAbortError } from "../hooks";

export interface ShotputTemplateError {
	readonly _tag: "ShotputTemplateError";
	readonly message: string;
	readonly cause?: unknown;
}

export interface ShotputConfigError {
	readonly _tag: "ShotputConfigError";
	readonly message: string;
	readonly field?: string;
	readonly cause?: unknown;
}

export interface ShotputHookAbortError {
	readonly _tag: "ShotputHookAbortError";
	readonly message: string;
	readonly hookStage: string;
	readonly cause?: unknown;
}

export interface ShotputSourceError {
	readonly _tag: "ShotputSourceError";
	readonly message: string;
	readonly sourcePath: string;
	readonly sourceType?: string;
	readonly cause?: unknown;
}

export type ShotputEffectError =
	| ShotputTemplateError
	| ShotputConfigError
	| ShotputHookAbortError
	| ShotputSourceError;

export function classifyError(error: unknown): ShotputEffectError {
	if (error instanceof HookAbortError) {
		return {
			_tag: "ShotputHookAbortError",
			message: error.message,
			hookStage: error.name,
			cause: error,
		};
	}

	if (error instanceof Error) {
		return {
			_tag: "ShotputTemplateError",
			message: error.message,
			cause: error,
		};
	}

	return {
		_tag: "ShotputTemplateError",
		message: String(error),
		cause: error,
	};
}
