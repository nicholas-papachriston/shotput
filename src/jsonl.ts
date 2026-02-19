/**
 * Parse newline-delimited JSON (JSONL) using Bun's built-in streaming parser.
 * @see https://bun.com/docs/runtime/jsonl
 */

interface JsonlParseChunkResult {
	values: unknown[];
	read: number;
	done: boolean;
	error: SyntaxError | null;
}

interface BunJSONL {
	parse(input: string | Uint8Array): unknown[];
	parseChunk(
		input: string | Uint8Array,
		start?: number,
		end?: number,
	): JsonlParseChunkResult;
}

const jsonlApi = (Bun as unknown as { JSONL: BunJSONL }).JSONL;

/**
 * Parse a complete JSONL input and return an array of all parsed values.
 * Each line must be a valid JSON value (object, array, number, string, etc.).
 *
 * @param input - JSONL string or Uint8Array (UTF-8 BOM at start of buffer is skipped)
 * @returns Array of parsed values
 * @throws SyntaxError if any line contains invalid JSON
 *
 * @example
 * ```ts
 * const records = parseJsonl('{"name":"Alice"}\n{"name":"Bob"}\n');
 * // [{ name: "Alice" }, { name: "Bob" }]
 * ```
 */
export function parseJsonl(input: string | Uint8Array): unknown[] {
	return jsonlApi.parse(input);
}

/**
 * Parse as many complete JSONL values as possible from a chunk (for streaming).
 * Use when receiving data incrementally; use `read` to slice off consumed input.
 *
 * @param input - JSONL string or Uint8Array
 * @param start - Optional start byte offset (Uint8Array only)
 * @param end - Optional end byte offset (Uint8Array only)
 * @returns { values, read, done, error } — does not throw on invalid JSON; error is set instead
 *
 * @example
 * ```ts
 * let buffer = "";
 * for await (const chunk of stream) {
 *   buffer += chunk;
 *   const result = parseJsonlChunk(buffer);
 *   for (const value of result.values) handleRecord(value);
 *   buffer = buffer.slice(result.read);
 * }
 * ```
 */
export function parseJsonlChunk(
	input: string | Uint8Array,
	start?: number,
	end?: number,
): JsonlParseChunkResult {
	if (typeof input === "string") {
		return jsonlApi.parseChunk(input);
	}
	if (start !== undefined && end !== undefined) {
		return jsonlApi.parseChunk(input, start, end);
	}
	if (start !== undefined) {
		return jsonlApi.parseChunk(input, start);
	}
	return jsonlApi.parseChunk(input);
}
