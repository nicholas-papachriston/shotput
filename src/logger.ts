const isObject = (obj: unknown): obj is object =>
	typeof obj === "object" && obj !== null;

const safeStringify = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export const getLogger = (logPrefix?: string) => {
	const isDebug = process.env["DEBUG"] === "true";
	const prefix = logPrefix ? `${logPrefix} ` : "";

	return {
		info: (message: unknown) => {
			if (isDebug) {
				if (isObject(message)) {
					console.log(`[INFO] ${prefix}${safeStringify(message)}`);
				} else console.log(`[INFO] ${prefix}${message}`);
			}
		},
		warn: (message: unknown) => {
			if (isDebug) {
				if (isObject(message)) {
					console.warn(`[WARN] ${prefix}${safeStringify(message)}`);
				} else console.warn(`[WARN] ${prefix}${message}`);
			}
		},
		error: (message: unknown, error?: unknown) => {
			if (isObject(message)) {
				console.error(
					`[ERROR] ${prefix}${safeStringify(message)}`,
					error ? error : "",
				);
			} else console.error(`[ERROR] ${prefix}${message}`, error ? error : "");
		},
	};
};
