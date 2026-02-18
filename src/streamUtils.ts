/**
 * Consume a ReadableStream<string> to a single string.
 */
export async function consumeStreamToString(
	stream: ReadableStream<string>,
): Promise<string> {
	const reader = stream.getReader();
	const chunks: string[] = [];
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value !== undefined) chunks.push(value);
		}
		return chunks.join("");
	} finally {
		reader.releaseLock();
	}
}
