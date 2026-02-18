import type { ShotputConfig } from "./config";

/** Approximate chars per token for heuristic when no tiktoken is used. */
const CHARS_PER_TOKEN = 4;

/**
 * Returns a function that measures content length for budgeting.
 * When config.tokenizer is set, returns token count; otherwise character count.
 * For "openai" | "cl100k_base" uses a heuristic (~4 chars/token); for a function, uses it directly.
 */
export function getCountFn(config: ShotputConfig): (text: string) => number {
	const t = config.tokenizer;
	if (t === undefined) {
		return (text: string) => text.length;
	}
	if (typeof t === "function") {
		return t;
	}
	// "openai" | "cl100k_base": use heuristic so no dependency required
	return (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);
}
