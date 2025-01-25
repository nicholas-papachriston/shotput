import { mkdir, stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const ensureDirectoryExists = async (dir: string): Promise<void> => {
	try {
		await mkdir(dir, { recursive: true });
	} catch (err) {
		if ((err as { code?: string }).code !== "EEXIST") {
			throw new Error(`Failed to create directory ${dir}: ${err}`);
		}
	}
};

export const isDirectory = async (path: string): Promise<boolean> => {
	try {
		const stats = await stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
};

export const getAllFiles = async (dirPath: string): Promise<string[]> => {
	const files = await readdir(dirPath, { withFileTypes: true });

	const paths = await Promise.all(
		files.map(async (file) => {
			const path = join(dirPath, file.name);
			return file.isDirectory() ? getAllFiles(path) : [path];
		}),
	);

	return paths.flat();
};
