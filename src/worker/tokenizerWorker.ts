/**
 * Worker that counts tokens for a given text.
 * Used when config.tokenizerWorker is set to offload token counting from the main thread.
 * Uses heuristic (~4 chars per token) by default.
 */

declare const self: Worker;

const CHARS_PER_TOKEN = 4;

function countTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

(self as unknown as { onmessage: (ev: unknown) => void }).onmessage = (
	event: unknown,
) => {
	const ev = event as { data?: { type?: string; text?: string; id?: number } };
	const msg = ev.data;
	if (msg?.type === "count" && typeof msg.text === "string") {
		const count = countTokens(msg.text);
		postMessage({ count, id: msg.id });
	}
};
