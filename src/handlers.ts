import type { ShotputConfig } from "./config";
import { handleCustomSource } from "./custom";
import { handleDirectory } from "./directory";
import { handleFile } from "./file";
import { handleFunction } from "./function";
import { handleGlob } from "./glob";
import { handleHttp } from "./http";
import { getMatchingPlugin } from "./plugins";
import { handleS3 } from "./s3";
import { handleSkill } from "./skill";
import { TemplateType } from "./types";

export interface HandlerResult {
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
	mergeContext?: Record<string, unknown>;
}

export type TemplateHandler = (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath?: string,
) => Promise<HandlerResult>;

function fileHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleFile(config, result, path, match, remainingLength);
}

function directoryHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleDirectory(config, result, path, match, remainingLength);
}

function globHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleGlob(config, result, path, match, remainingLength);
}

function s3Handler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleS3(config, result, path, match, remainingLength);
}

function httpHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleHttp(config, result, path, match, remainingLength);
}

function functionHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath?: string,
): Promise<HandlerResult> {
	return handleFunction(
		config,
		result,
		path,
		match,
		remainingLength,
		basePath ?? process.cwd(),
	);
}

function skillHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<HandlerResult> {
	return handleSkill(config, result, path, match, remainingLength);
}

function customHandler(
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
	basePath?: string,
): Promise<HandlerResult> {
	const plugin = getMatchingPlugin(config, path);
	if (!plugin) {
		throw new Error(`No custom plugin matched for path: ${path}`);
	}
	return handleCustomSource(
		plugin,
		config,
		result,
		path,
		match,
		remainingLength,
		basePath ?? process.cwd(),
	);
}

/**
 * Returns the handler for a template type. All handlers accept optional basePath
 * as the last argument (used by Function and Custom).
 */
export function getHandler(type: TemplateType): TemplateHandler {
	switch (type) {
		case TemplateType.File:
			return fileHandler;
		case TemplateType.Directory:
			return directoryHandler;
		case TemplateType.Glob:
		case TemplateType.Regex:
			return globHandler;
		case TemplateType.S3:
			return s3Handler;
		case TemplateType.Http:
			return httpHandler;
		case TemplateType.Function:
			return functionHandler;
		case TemplateType.Skill:
			return skillHandler;
		case TemplateType.Custom:
			return customHandler;
		default:
			throw new Error(`Unsupported template type: ${type}`);
	}
}
