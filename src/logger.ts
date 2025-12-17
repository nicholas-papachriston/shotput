import { CONFIG } from "./config";

export const getLogger = (logPrefix?: string) => {
	return {
		info: (message: unknown) => {
			if (CONFIG.debug) console.log(`[INFO] ${logPrefix} ${message}`);
		},
		warn: (message: unknown) => {
			if (CONFIG.debug) console.warn(`[WARN] ${logPrefix} ${message}`);
		},
		error: (message: unknown, error?: unknown) => {
			console.error(`[ERROR] ${logPrefix} ${message}`, error ? error : "");
		},
	};
};
