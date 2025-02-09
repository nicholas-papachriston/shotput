import { CONFIG } from "./config";

export const getLogger = (logPrefix?: string) => {
	return {
		info: (message: string) => {
			if (CONFIG.debug) console.log(`[INFO] ${logPrefix} ${message}`);
		},
		warn: (message: string) => {
			if (CONFIG.debug) console.warn(`[WARN] ${logPrefix} ${message}`);
		},
		error: (message: string) => {
			console.error(`[ERROR] ${logPrefix} ${message}`);
		},
	};
};
