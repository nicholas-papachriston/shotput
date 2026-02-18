import { createHash } from "node:crypto";
import type { MessageOutput, Section } from "./types";

const SECTION_CLOSE = "{{/section}}";

function parseStable(attrs: string | undefined): boolean {
	if (!attrs?.trim()) return false;
	return /stable\s*=\s*["']?true["']?/i.test(attrs);
}

function sha256Hex(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Find the matching {{/section}} for the {{#section:name}} at startIndex.
 */
function findSectionClose(content: string, startIndex: number): number {
	let depth = 1;
	let pos = startIndex;
	while (depth > 0) {
		const nextOpen = content.indexOf("{{#section:", pos);
		const nextClose = content.indexOf(SECTION_CLOSE, pos);
		if (nextClose === -1) return -1;
		if (nextOpen !== -1 && nextOpen < nextClose) {
			depth++;
			pos = nextOpen + 1;
		} else {
			depth--;
			if (depth === 0) return nextClose;
			pos = nextClose + SECTION_CLOSE.length;
		}
	}
	return -1;
}

export interface ParseSectionsResult {
	sections: Section[];
	remainingContent: string;
}

/**
 * Parse {{#section:name stable=true}}...{{/section}} blocks from post-interpolation content.
 * Returns sections with contentHash and any content not inside a section as remainingContent.
 * If sectionBudgets is provided, section content is trimmed to the given character limit per section name.
 */
export function parseOutputSections(
	content: string,
	sectionBudgets?: Record<string, number>,
): ParseSectionsResult {
	const sections: Section[] = [];
	const sectionOpenRegex = /\{\{#section:(\w+)(\s+[^}]*)?\}\}/g;
	let lastEnd = 0;
	let match: RegExpExecArray | null;
	const remainingChunks: string[] = [];

	match = sectionOpenRegex.exec(content);
	while (match !== null) {
		const name = match[1];
		const attrs = match[2];
		const openStart = match.index;
		const openEnd = match.index + match[0].length;
		const closeIndex = findSectionClose(content, openEnd);
		if (closeIndex === -1) break;
		let sectionContent = content.slice(openEnd, closeIndex);
		const budget = sectionBudgets?.[name];
		if (typeof budget === "number" && sectionContent.length > budget) {
			sectionContent = sectionContent.slice(0, budget);
		}
		const stable = parseStable(attrs);
		sections.push({
			name,
			content: sectionContent,
			stable,
			contentHash: sha256Hex(sectionContent),
			metadata: [],
		});
		if (openStart > lastEnd) {
			remainingChunks.push(content.slice(lastEnd, openStart));
		}
		lastEnd = closeIndex + SECTION_CLOSE.length;
		sectionOpenRegex.lastIndex = lastEnd;
		match = sectionOpenRegex.exec(content);
	}
	if (lastEnd < content.length) {
		remainingChunks.push(content.slice(lastEnd));
	}
	const remainingContent = remainingChunks.join("").trim();
	return { sections, remainingContent };
}

export function formatMessages(
	sections: Section[],
	sectionRoles: Record<string, "system" | "user" | "assistant">,
): MessageOutput[] {
	return sections
		.filter((s) => sectionRoles[s.name])
		.map((s) => ({
			role: sectionRoles[s.name],
			content: s.content,
		}));
}
