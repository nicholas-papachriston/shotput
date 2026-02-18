import { join } from "node:path";
import type { ShotputConfig } from "./config";
import { processContent } from "./content";
import { getLogger } from "./logger";
import { SecurityError, validatePath, validateSkillSource } from "./security";

const log = getLogger("skill");

export const SKILL_TEMPLATE = "skill:";

interface SkillFrontmatter {
	name: string;
	description: string;
	license?: string;
}

interface SkillContent {
	frontmatter: SkillFrontmatter;
	instructions: string;
}

/**
 * Parse SKILL.md content to extract frontmatter and instructions
 */
const parseSkillMd = (content: string): SkillContent => {
	// Parse YAML frontmatter between --- markers
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!frontmatterMatch) {
		throw new Error("Invalid SKILL.md format - missing frontmatter");
	}

	const yamlContent = frontmatterMatch[1];
	const instructions = frontmatterMatch[2].trim();

	// Simple YAML parsing for frontmatter (name and description)
	const nameMatch = yamlContent.match(/^name:\s*(.+)$/m);
	const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);
	const licenseMatch = yamlContent.match(/^license:\s*(.+)$/m);

	if (!nameMatch || !descriptionMatch) {
		throw new Error(
			"Invalid SKILL.md frontmatter - missing name or description",
		);
	}

	return {
		frontmatter: {
			name: nameMatch[1].trim(),
			description: descriptionMatch[1].trim(),
			license: licenseMatch?.[1]?.trim(),
		},
		instructions,
	};
};

/**
 * Load skill content from a local directory
 */
const loadLocalSkill = async (
	config: ShotputConfig,
	skillName: string,
	includeReferences: boolean,
): Promise<string> => {
	const skillsDir = config.skillsDir || "./skills";
	const skillDir = join(skillsDir, skillName);
	const skillFile = join(skillDir, "SKILL.md");

	// Validate skill path for security
	const validatedPath = validatePath(config, skillFile);

	const file = Bun.file(validatedPath);
	const exists = await file.exists();
	if (!exists) {
		throw new Error(`Skill not found: ${skillName}`);
	}

	const content = await file.text();
	const parsed = parseSkillMd(content);

	// Format the skill content
	let formattedSkill = `## Skill: ${parsed.frontmatter.name}

**Description:** ${parsed.frontmatter.description}

${parsed.instructions}`;

	// Optionally include reference files
	if (includeReferences) {
		const referenceDir = join(skillDir, "reference");
		try {
			const refDirValidated = validatePath(config, referenceDir);

			// Check if reference directory exists
			const glob = new Bun.Glob("*.md");
			let referenceContent = "";

			for await (const refFile of glob.scan(refDirValidated)) {
				const refPath = join(refDirValidated, refFile);
				const refContent = await Bun.file(refPath).text();
				referenceContent += `\n\n### Reference: ${refFile}\n\n${refContent}`;
			}

			if (referenceContent) {
				formattedSkill += `\n\n## Skill References\n${referenceContent}`;
			}
		} catch (error) {
			// Reference directory doesn't exist or can't be read, skip silently
			log.info(`No reference files found for skill: ${skillName}`);
		}
	}

	return formattedSkill;
};

/**
 * Load skill content from a remote GitHub repository
 */
const loadRemoteSkill = async (
	config: ShotputConfig,
	repoPath: string,
	skillName: string,
	includeReferences: boolean,
): Promise<string> => {
	if (!config.allowRemoteSkills) {
		throw new SecurityError(
			"Remote skill loading is disabled. Set allowRemoteSkills: true to enable.",
		);
	}

	// Validate against allowed skill sources
	validateSkillSource(config, repoPath);

	const baseUrl = `https://raw.githubusercontent.com/${repoPath}/main/skills/${skillName}`;
	const skillUrl = `${baseUrl}/SKILL.md`;

	log.info(`Fetching remote skill from: ${skillUrl}`);

	const response = await fetch(skillUrl, {
		headers: {
			Accept: "text/plain",
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch skill from ${skillUrl}: ${response.status} ${response.statusText}`,
		);
	}

	const content = await response.text();
	const parsed = parseSkillMd(content);

	// Format the skill content
	let formattedSkill = `## Skill: ${parsed.frontmatter.name}

**Description:** ${parsed.frontmatter.description}

${parsed.instructions}`;

	// Optionally include reference files (for remote skills, we need to fetch them individually)
	if (includeReferences) {
		// Try to fetch common reference files
		const commonReferences = [
			"mcp_best_practices.md",
			"python_mcp_server.md",
			"node_mcp_server.md",
			"evaluation.md",
		];

		let referenceContent = "";

		for (const refFile of commonReferences) {
			try {
				const refUrl = `${baseUrl}/reference/${refFile}`;
				const refResponse = await fetch(refUrl, {
					headers: { Accept: "text/plain" },
				});

				if (refResponse.ok) {
					const refContent = await refResponse.text();
					referenceContent += `\n\n### Reference: ${refFile}\n\n${refContent}`;
				}
			} catch {
				// Reference file doesn't exist, skip silently
			}
		}

		if (referenceContent) {
			formattedSkill += `\n\n## Skill References\n${referenceContent}`;
		}
	}

	return formattedSkill;
};

/**
 * Parse skill path to extract components
 * Formats:
 *   - "skill-name" -> local skill
 *   - "github:owner/repo/skill-name" -> remote GitHub skill
 *   - "skill-name:full" -> local skill with references
 *   - "github:owner/repo/skill-name:full" -> remote skill with references
 */
const parseSkillPath = (
	path: string,
): {
	isRemote: boolean;
	repoPath?: string;
	skillName: string;
	includeReferences: boolean;
} => {
	// Check for :full suffix
	const includeReferences = path.endsWith(":full");
	const cleanPath = includeReferences ? path.slice(0, -5) : path;

	// Check for github: prefix
	if (cleanPath.startsWith("github:")) {
		const githubPath = cleanPath.slice(7); // Remove "github:"
		const parts = githubPath.split("/");

		if (parts.length < 3) {
			throw new Error(
				`Invalid GitHub skill path: ${path}. Expected format: github:owner/repo/skill-name`,
			);
		}

		const repoPath = `${parts[0]}/${parts[1]}`;
		const skillName = parts.slice(2).join("/");

		return {
			isRemote: true,
			repoPath,
			skillName,
			includeReferences,
		};
	}

	// Local skill
	return {
		isRemote: false,
		skillName: cleanPath,
		includeReferences,
	};
};

/**
 * Handle skill template type
 * Loads and processes Anthropic Skills from local or remote sources
 */
export const handleSkill = async (
	config: ShotputConfig,
	result: string,
	path: string,
	match: string,
	remainingLength: number,
): Promise<{
	operationResults: string;
	combinedRemainingCount: number;
	replacement?: string;
}> => {
	// Extract skill path from the full path (remove "skill:" prefix if present)
	const skillPath = path.startsWith(SKILL_TEMPLATE)
		? path.slice(SKILL_TEMPLATE.length)
		: path;

	log.info(`Loading skill: ${skillPath}`);

	try {
		const { isRemote, repoPath, skillName, includeReferences } =
			parseSkillPath(skillPath);

		let skillContent: string;

		if (isRemote && repoPath) {
			skillContent = await loadRemoteSkill(
				config,
				repoPath,
				skillName,
				includeReferences,
			);
		} else {
			skillContent = await loadLocalSkill(config, skillName, includeReferences);
		}

		const processed = await processContent(skillContent, remainingLength);

		if (processed.truncated) {
			log.warn(`Skill content truncated for ${skillPath} due to length limit`);
		}

		return {
			operationResults: result.replace(match, processed.content),
			combinedRemainingCount: processed.remainingLength,
			replacement: processed.content,
		};
	} catch (error) {
		if (error instanceof SecurityError) {
			log.error(`Security error loading skill ${skillPath}: ${error.message}`);
			return {
				operationResults: result.replace(
					match,
					`[Security Error: ${error.message}]`,
				),
				combinedRemainingCount: remainingLength,
			};
		}

		log.error(`Failed to load skill ${skillPath}: ${error}`);
		return {
			operationResults: result.replace(
				match,
				`[Error loading skill: ${skillPath}]`,
			),
			combinedRemainingCount: remainingLength,
		};
	}
};
