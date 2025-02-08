import { CONFIG } from "./config";
import { ensureDirectoryExists } from "./directory";
import { interpolation } from "./interpolation";

export async function shotput(config?: typeof CONFIG) {
	if (config) Object.assign(CONFIG, config);
	await ensureDirectoryExists(CONFIG.responseDir, CONFIG.promptDir);
	const prompt = await Bun.file(CONFIG.promptPath).text().then(interpolation);
	if (CONFIG.debug) await Bun.write(CONFIG.debugFile, prompt);
	return prompt;
};

if (require.main === module) {
	shotput().then(console.log).catch(console.error);
}