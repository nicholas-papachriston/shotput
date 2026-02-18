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
	return (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface TokenizerWorkerEntry {
	worker: Worker;
	pending: Map<number, (count: number) => void>;
	nextId: number;
}

const workerCache = new Map<string, TokenizerWorkerEntry>();

function getOrCreateTokenizerWorker(workerPath: string): TokenizerWorkerEntry {
	let entry = workerCache.get(workerPath);
	if (entry) return entry;

	const pending = new Map<number, (count: number) => void>();
	const worker = new Worker(workerPath, { type: "module" });
	worker.onmessage = ((e: { data?: { count?: number; id?: number } }) => {
		const data = e.data;
		const { count, id } = data ?? {};
		if (id !== undefined && typeof count === "number" && pending.has(id)) {
			const resolve = pending.get(id);
			pending.delete(id);
			resolve?.(count);
		}
	}) as (ev: unknown) => void;
	entry = { worker, pending, nextId: 0 };
	workerCache.set(workerPath, entry);
	return entry;
}

/**
 * Returns an async function that measures content length.
 * When config.tokenizerWorker is set, counting runs in a worker; otherwise uses sync getCountFn.
 */
export function getCountFnAsync(
	config: ShotputConfig,
): (text: string) => Promise<number> {
	const workerPath = config.tokenizerWorker;
	if (workerPath) {
		const entry = getOrCreateTokenizerWorker(workerPath);
		return (text: string) =>
			new Promise<number>((resolve) => {
				const reqId = entry.nextId++;
				entry.pending.set(reqId, resolve);
				entry.worker.postMessage({ type: "count", text, id: reqId });
			});
	}
	const syncFn = getCountFn(config);
	return (text: string) => Promise.resolve(syncFn(text));
}
