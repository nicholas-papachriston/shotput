import { stat } from "node:fs/promises";
import { FUNCTION_TEMPLATE } from "./function";
import { TemplateType } from "./types";
import { getLogger } from "./logger";

const log = getLogger("template");

const regexIndicators = [
	/\/.+\//, // Pattern enclosed in forward slashes
	/[\^\$\(\)\+\{\}]/, // Common regex special characters
];

export const findTemplateType = async (path: string): Promise<TemplateType> => {
	try {
		await stat(path)
			.then((stats) => {
				if (stats.isFile()) {
					return TemplateType.File;
				}

				if (stats.isDirectory()) {
					return TemplateType.Directory;
				}
			})
			.catch(() => log.info("Path is not a file or directory"));

		if (path.includes(FUNCTION_TEMPLATE)) {
			return TemplateType.Function;
		}

		if (/[\*\?\[\]]/.test(path)) {
			return TemplateType.Glob;
		}

		if (/^https?:\/\/.+/.test(path)) {
			return TemplateType.Http;
		}

		if (/^s3:\/\/.+/.test(path)) {
			return TemplateType.S3;
		}

		if (regexIndicators.some((pattern) => pattern.test(path))) {
			return TemplateType.Regex;
		}

		return TemplateType.String;
	} catch (error) {
		log.info(JSON.stringify(error));
		return TemplateType.String;
	}
};
