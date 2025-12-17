import { CONFIG } from "./config";

const isObject = (obj: unknown): obj is object =>
	typeof obj === "object" && obj !== null;

export const getLogger = (logPrefix?: string) => {
	return {
		info: (message: unknown) => {
			if (CONFIG.debug) {
				if (isObject(message)) {
					console.log(`[INFO] ${logPrefix} ${JSON.stringify(message)}`);
				} else console.log(`[INFO] ${logPrefix} ${message}`);
			}
		},
		warn: (message: unknown) => {
			if (CONFIG.debug) {
				if (isObject(message)) {
					console.warn(`[WARN] ${logPrefix} ${JSON.stringify(message)}`);
				} else console.warn(`[WARN] ${logPrefix} ${message}`);
			}
		},
		error: (message: unknown, error?: unknown) => {
			if (isObject(message)) {
				console.error(
					`[ERROR] ${logPrefix} ${JSON.stringify(message)}`,
					error ? error : "",
				);
			} else
				console.error(`[ERROR] ${logPrefix} ${message}`, error ? error : "");
		},
	};
};
