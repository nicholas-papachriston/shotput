import { isAbsolute, resolve } from "node:path";
import { CONFIG } from "./config";
import { getAllFiles, isDirectory } from "./directory";
import type { FileResult } from "./types";

const processContent = async (
	content: string,
	remainingLength: number,
): Promise<FileResult> => {
	if (content.length > remainingLength) {
		return {
			content: content.slice(0, remainingLength),
			length: remainingLength,
			truncated: true,
		};
	}
	return {
		content,
		length: content.length,
		truncated: false,
	};
};

const resolvePath = (basePath: string, filePath: string): string =>
	isAbsolute(filePath) ? filePath : resolve(basePath, filePath);

export const interpolation = async (
	content: string,
	basePath: string = process.cwd(),
): Promise<string> => {
	const pattern = /\{\{([^}]+)\}\}/g;
	const matches = content.match(pattern);
	if (!matches) return content;

	let remainingLength = CONFIG.maxPromptLength;
	let result = content;

	for (const match of matches) {
		const path = resolvePath(basePath, match.slice(2, -2).trim());

		try {
			if (await isDirectory(path)) {
				let combinedContent = "";
				for (const file of await getAllFiles(path)) {
					const fileContent = `filename:${path}:\n${await Bun.file(file).text()}\n`;
					const processed = await processContent(fileContent, remainingLength);

					if (processed.truncated) {
						console.warn(`Content truncated for ${file} due to length limit`);
					}

					combinedContent += processed.content;
					remainingLength -= processed.length;

					if (remainingLength <= 0) {
						console.warn("Maximum prompt length reached");
						break;
					}
				}

				result = result.replace(match, combinedContent);
			} else {
				const fileContent = `filename:${path}:\n${await Bun.file(path).text()}`;
				const processed = await processContent(fileContent, remainingLength);

				if (processed.truncated) {
					console.warn(`Content truncated for ${path} due to length limit`);
				}

				result = result.replace(match, processed.content);
				remainingLength -= processed.length;
			}
		} catch (err) {
			console.error(`Failed to read path ${path}:`, err);
			result = result.replace(match, `[Error reading ${path}]`);
		}
	}

	return result.trim();
};
