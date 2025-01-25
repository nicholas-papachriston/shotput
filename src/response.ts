import { join } from "node:path";
import { CONFIG } from "./config";

export const generateResponse = async (prompt: string): Promise<void> => {
	console.log(`Submitting prompt to model ${CONFIG.modelName}`);
	await fetch(`${CONFIG.baseUrl}/api/generate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			prompt,
			stream: true,
			model: CONFIG.modelName,
			temperature: CONFIG.temperature,
			top_p: CONFIG.top_p,
			max_tokens: CONFIG.max_tokens,
		}),
	}).then(async (res) => {
		if (!res.ok || !res.body) {
			throw new Error(`HTTP error: ${res.status}`);
		}
		const fileName = `${Date.now()}.md`;
		const file = Bun.file(join(CONFIG.responsesDir, fileName));
		const writer = file.writer();

		const reader = res.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const text = new TextDecoder().decode(value);
			try {
				const parsed = JSON.parse(text);
				writer.write(parsed.response);
				if (parsed.done) break;
			} catch (err) {
				console.error(`Failed to parse response: ${err}`);
				writer.write(text);
			}
		}

		console.log(`Response saved as ${fileName}`);
	});
};
