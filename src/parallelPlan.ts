import type { ShotputConfig } from "./config";
import { getLogger } from "./logger";
import { resolveTemplatePath } from "./pathResolve";
import { findTemplateType } from "./template";
import { TemplateType } from "./types";

const log = getLogger("parallelPlan");

export interface TemplateTask {
	type: TemplateType;
	path: string;
	match: string;
	/** Start index of this match in the original content; used for ordered assembly. */
	matchIndex: number;
	basePath?: string;
	originalIndex: number;
	estimatedLength?: number;
	priority: number;
	isCycle?: boolean;
}

/**
 * Calculate priority for template processing.
 * Lower numbers = higher priority (processed first).
 */
export function calculatePriority(type: TemplateType, index: number): number {
	const typePriority: Record<TemplateType, number> = {
		[TemplateType.String]: 100,
		[TemplateType.File]: 10,
		[TemplateType.Directory]: 50,
		[TemplateType.Glob]: 40,
		[TemplateType.Regex]: 40,
		[TemplateType.S3]: 30,
		[TemplateType.Http]: 20,
		[TemplateType.Function]: 60,
		[TemplateType.Skill]: 70,
		[TemplateType.Custom]: 35,
		[TemplateType.Format]: 12,
	};
	return (typePriority[type] ?? 100) + index * 0.01;
}

/**
 * Parse template content to extract all template patterns in document order.
 */
export async function planTemplates(
	content: string,
	basePath: string,
	config: ShotputConfig,
	expandingPaths?: Set<string>,
): Promise<TemplateTask[]> {
	const matchesWithIndex: { match: string; index: number }[] = [];
	let pos = 0;
	while (pos < content.length) {
		const open = content.indexOf("{{", pos);
		if (open === -1) break;
		let searchFrom = open + 2;
		let matched = false;
		while (searchFrom < content.length) {
			const close = content.indexOf("}}", searchFrom);
			if (close === -1) break;
			const inner = content.slice(open + 2, close);
			if (!inner.includes("}")) {
				const match = content.slice(open, close + 2);
				matchesWithIndex.push({ match, index: open });
				pos = close + 2;
				matched = true;
				break;
			}
			searchFrom = close + 1;
		}
		if (!matched) pos = open + 1;
	}

	if (matchesWithIndex.length === 0) {
		return [];
	}

	const tasks: TemplateTask[] = [];

	const FORMAT_PREFIX = /^(yaml|json|jsonl|xml|md):/;

	for (let i = 0; i < matchesWithIndex.length; i++) {
		const { match, index: matchIndex } = matchesWithIndex[i];
		const rawPath = match.slice(2, -2).trim();
		const formatMatch = rawPath.match(FORMAT_PREFIX);

		if (formatMatch) {
			const format = formatMatch[1];
			const pathWithoutPrefix = rawPath.slice(format.length + 1).trim();
			const path = resolveTemplatePath(basePath, pathWithoutPrefix, config);
			tasks.push({
				type: TemplateType.Format,
				path: `${format}:${path}`,
				match,
				matchIndex,
				basePath,
				originalIndex: i,
				priority: calculatePriority(TemplateType.Format, i),
			});
			continue;
		}

		let path = resolveTemplatePath(basePath, rawPath, config);

		if (expandingPaths?.has(path)) {
			tasks.push({
				type: TemplateType.File,
				path,
				match,
				matchIndex,
				originalIndex: i,
				priority: calculatePriority(TemplateType.File, i),
				isCycle: true,
			});
			continue;
		}

		try {
			const templateType = await findTemplateType(path, rawPath, config);

			if (templateType === TemplateType.String) {
				continue;
			}

			if (templateType === TemplateType.Custom) {
				path = rawPath;
			}

			tasks.push({
				type: templateType,
				path,
				match,
				matchIndex,
				basePath,
				originalIndex: i,
				priority: calculatePriority(templateType, i),
			});
		} catch (error) {
			log.warn(`Failed to determine template type for ${path}: ${error}`);
		}
	}

	log.info(`Planned ${tasks.length} templates for processing`);
	return tasks;
}
