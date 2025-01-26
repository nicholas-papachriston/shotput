import { stat } from "node:fs/promises";
import { TemplateType } from "./types";

export const findTemplateType = async (path: string): Promise<TemplateType> => {
	try {
		const stats = await stat(path);
		if (stats.isFile()) {
			return TemplateType.File;
		}

		if (stats.isDirectory()) {
			return TemplateType.Directory;
		}

		if (path.startsWith("s3://")) {
			return TemplateType.S3;
		}

		if (path.includes("*")) {
			return TemplateType.Glob;
		}

		if (path.includes("/")) {
			return TemplateType.Regex;
		}

		return TemplateType.String;
	} catch (error) {
		console.log(JSON.stringify(error));
		return TemplateType.String;
	}
};
