import { CONFIG } from "./config";
import { ensureDirectoryExists } from "./directory";
import { interpolation } from "./interpolation";

const run = async () => {
	await ensureDirectoryExists(CONFIG.responseDir, CONFIG.templateDir);
	const template = await Bun.file(`${CONFIG.templateDir}${CONFIG.templateFile}`).text().then(interpolation);
	if (CONFIG.debug) await Bun.write(CONFIG.debugFile, template);
	return template;
};

/**
 * Ex:
 * ```ts
 * const instance = shotput(config);
 * instance.run().then(console.log).catch(console.error);
 * ```
 */
export function shotput(config?: typeof CONFIG) {
	if (config) Object.assign(CONFIG, config);
	return {
		run,
	};
}

if (require.main === module) {
	const shotputInstance = shotput();
	shotputInstance.run().catch(console.error);
}
