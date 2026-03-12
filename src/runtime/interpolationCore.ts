import type { ShotputConfig } from "../config";
import { evaluateRules } from "../language/shotput/rules";
import { substituteVariables } from "../language/shotput/variables";
import type { TemplateType } from "../types";
import {
	inclusionBasePathFor,
	interpolationPattern,
} from "./interpolationApply";

export interface InterpolationMetaEntry {
	path: string;
	type: string;
	duration: number;
}

export function createEffectiveConfig(
	config: ShotputConfig,
	mergeContext?: Record<string, unknown>,
): ShotputConfig {
	if (!mergeContext) return config;
	return {
		...config,
		context: { ...(config.context ?? {}), ...mergeContext },
	};
}

export function evaluateInterpolationContent(
	content: string,
	config: ShotputConfig,
	depth: number,
	options?: {
		rulesAlreadyEvaluated?: boolean;
		contentFullyEvaluated?: boolean;
	},
): string {
	const rulesAlreadyEvaluated = options?.rulesAlreadyEvaluated ?? false;
	const contentFullyEvaluated = options?.contentFullyEvaluated ?? false;

	const contentAfterRules =
		contentFullyEvaluated && depth === 0
			? content
			: rulesAlreadyEvaluated && depth === 0
				? content
				: evaluateRules(content, config);

	return contentFullyEvaluated && depth === 0
		? content
		: substituteVariables(contentAfterRules, config);
}

export function mapInterpolationMetadata(
	metadata: Array<{ path: string; type: string; processingTime: number }>,
): InterpolationMetaEntry[] {
	return metadata.map((entry) => ({
		path: entry.path,
		type: entry.type,
		duration: entry.processingTime,
	}));
}

export function resolveNestedInclusionBase(
	processedTemplate: string,
	currentMetadata: InterpolationMetaEntry[],
	basePath: string,
): string {
	const moreMatches = processedTemplate.match(interpolationPattern);
	if (!moreMatches || currentMetadata.length !== 1) return basePath;

	const firstFull = moreMatches[0];
	const innerPath =
		typeof firstFull === "string" ? firstFull.slice(2, -2).trim() : "";
	const pathIsFileRelative =
		innerPath.startsWith("./") ||
		innerPath.startsWith("../") ||
		!innerPath.includes("/");

	if (!pathIsFileRelative) return basePath;

	return inclusionBasePathFor(
		currentMetadata[0].type as TemplateType,
		currentMetadata[0].path,
		basePath,
	);
}
