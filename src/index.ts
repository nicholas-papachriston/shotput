import readlinePromises from "node:readline/promises";
import { CONFIG } from "./config";
import { ensureDirectoryExists } from "./directory";
import { interpolation } from "./interpolation";
import { generateResponse } from "./response";

const main = async () => {
	process.on("SIGINT", () => process.exit(0));
	process.on("SIGTERM", () => process.exit(0));
	await ensureDirectoryExists(CONFIG.responsesDir);
	const readlineInterface = readlinePromises.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	while (true) {
		await readlineInterface
			.question("Press Enter to generate a new response")
			.then(() => {
				console.log("Generating response");
			});
		const promptStart = performance.now();
		const prompt = await Bun.file(CONFIG.promptPath).text().then(interpolation);
		await Bun.write("prompt_compiled.txt", prompt);
		console.log(`Prompt compiled in ${performance.now() - promptStart}ms`);
		const generationStart = performance.now();
		await generateResponse(prompt);
		console.log(
			`Response generated in ${performance.now() - generationStart}ms`,
		);
	}
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
