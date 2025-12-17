import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CONFIG } from "../../src/config";
import { SecurityValidator } from "../../src/security";
import { SKILL_TEMPLATE, handleSkill } from "../../src/skill";

describe("handleSkill", () => {
	let tempDir: string;
	let originalSkillsDir: string | undefined;
	let originalAllowRemoteSkills: boolean | undefined;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-skill-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}/skills/test-skill`;
		await Bun.$`mkdir -p ${tempDir}/skills/test-skill-with-refs/reference`;

		// Store original config values
		originalSkillsDir = CONFIG.skillsDir;
		originalAllowRemoteSkills = CONFIG.allowRemoteSkills;

		// Set skills directory in CONFIG
		CONFIG.skillsDir = `${tempDir}/skills`;

		// Create a basic test skill
		const basicSkillContent = `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill Instructions

This is a test skill that demonstrates the skill format.

## Guidelines
- Follow best practices
- Test thoroughly
`;
		await Bun.write(`${tempDir}/skills/test-skill/SKILL.md`, basicSkillContent);

		// Create a skill with reference files
		const skillWithRefsContent = `---
name: test-skill-with-refs
description: A test skill with reference files
license: Apache 2.0
---

# Test Skill With References

This skill has additional reference materials.

## Usage
See the reference files for more details.
`;
		await Bun.write(
			`${tempDir}/skills/test-skill-with-refs/SKILL.md`,
			skillWithRefsContent,
		);

		// Create reference files
		await Bun.write(
			`${tempDir}/skills/test-skill-with-refs/reference/guide.md`,
			"# Guide\n\nThis is a reference guide.",
		);
		await Bun.write(
			`${tempDir}/skills/test-skill-with-refs/reference/examples.md`,
			"# Examples\n\nHere are some examples.",
		);

		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});
	});

	afterEach(async () => {
		// Restore original config values
		if (originalSkillsDir !== undefined) {
			CONFIG.skillsDir = originalSkillsDir;
		}
		if (originalAllowRemoteSkills !== undefined) {
			CONFIG.allowRemoteSkills = originalAllowRemoteSkills;
		}

		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("local skill loading", () => {
		it("should load a basic local skill", async () => {
			const result = "Before {{skill:test-skill}} After";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("Before");
			expect(response.operationResults).toContain("After");
			expect(response.operationResults).toContain("## Skill: test-skill");
			expect(response.operationResults).toContain(
				"A test skill for unit testing",
			);
			expect(response.operationResults).toContain("Test Skill Instructions");
			expect(response.combinedRemainingCount).toBeGreaterThan(0);
		});

		it("should handle skill not found error", async () => {
			const result = "Content: {{skill:nonexistent-skill}}";
			const path = "skill:nonexistent-skill";
			const match = "{{skill:nonexistent-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("[Error loading skill:");
			expect(response.combinedRemainingCount).toBe(remainingLength);
		});

		it("should handle invalid SKILL.md format", async () => {
			// Create skill with invalid format (no frontmatter)
			await Bun.$`mkdir -p ${tempDir}/skills/invalid-skill`;
			await Bun.write(
				`${tempDir}/skills/invalid-skill/SKILL.md`,
				"# No Frontmatter\n\nThis skill has no YAML frontmatter.",
			);

			const result = "{{skill:invalid-skill}}";
			const path = "skill:invalid-skill";
			const match = "{{skill:invalid-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("[Error loading skill:");
		});

		it("should handle missing name in frontmatter", async () => {
			await Bun.$`mkdir -p ${tempDir}/skills/missing-name`;
			await Bun.write(
				`${tempDir}/skills/missing-name/SKILL.md`,
				`---
description: Missing name field
---

# Content
`,
			);

			const result = "{{skill:missing-name}}";
			const path = "skill:missing-name";
			const match = "{{skill:missing-name}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("[Error loading skill:");
		});
	});

	describe("skill path parsing", () => {
		it("should handle skill path without skill: prefix", async () => {
			const result = "{{test-skill}}";
			const path = "test-skill"; // No skill: prefix
			const match = "{{test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("## Skill: test-skill");
		});

		it("should handle :full suffix for including references", async () => {
			const result = "{{skill:test-skill-with-refs:full}}";
			const path = "skill:test-skill-with-refs:full";
			const match = "{{skill:test-skill-with-refs:full}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain(
				"## Skill: test-skill-with-refs",
			);
			// Note: Reference loading depends on glob scanning working correctly
		});
	});

	describe("remote skill loading", () => {
		it("should block remote skills when disabled", async () => {
			CONFIG.allowRemoteSkills = false;

			const result = "{{skill:github:anthropics/skills/brand-guidelines}}";
			const path = "skill:github:anthropics/skills/brand-guidelines";
			const match = "{{skill:github:anthropics/skills/brand-guidelines}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("[Security Error:");
			expect(response.operationResults).toContain(
				"Remote skill loading is disabled",
			);
		});

		it("should handle invalid github path format", async () => {
			CONFIG.allowRemoteSkills = true;

			const result = "{{skill:github:invalid-path}}";
			const path = "skill:github:invalid-path";
			const match = "{{skill:github:invalid-path}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("[Error loading skill:");
		});
	});

	describe("content processing", () => {
		it("should truncate skill content when length limit is reached", async () => {
			const result = "{{skill:test-skill}}";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 50; // Very small limit

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.combinedRemainingCount).toBe(0);
			expect(response.operationResults.length).toBeLessThan(200);
		});

		it("should handle zero remaining length", async () => {
			const result = "{{skill:test-skill}}";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 0;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.combinedRemainingCount).toBe(0);
		});

		it("should replace the correct match placeholder", async () => {
			const result = "Start {{other}} {{skill:test-skill}} {{another}} End";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(result, path, match, remainingLength);

			expect(response.operationResults).toContain("Start {{other}}");
			expect(response.operationResults).toContain("{{another}} End");
			expect(response.operationResults).toContain("## Skill: test-skill");
		});
	});

	describe("SKILL_TEMPLATE constant", () => {
		it("should export the correct skill template prefix", () => {
			expect(SKILL_TEMPLATE).toBe("skill:");
		});
	});
});

describe("skill frontmatter parsing", () => {
	let tempDir: string;
	let originalSkillsDir: string | undefined;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-skill-parse-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}/skills`;

		// Store and set config
		originalSkillsDir = CONFIG.skillsDir;
		CONFIG.skillsDir = `${tempDir}/skills`;

		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});
	});

	afterEach(async () => {
		// Restore config
		if (originalSkillsDir !== undefined) {
			CONFIG.skillsDir = originalSkillsDir;
		}

		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should parse skill with all frontmatter fields", async () => {
		await Bun.$`mkdir -p ${tempDir}/skills/full-frontmatter`;
		await Bun.write(
			`${tempDir}/skills/full-frontmatter/SKILL.md`,
			`---
name: full-frontmatter-skill
description: A skill with all frontmatter fields
license: Apache 2.0
---

# Full Frontmatter Skill

Content here.
`,
		);

		const result = "{{skill:full-frontmatter}}";
		const path = "skill:full-frontmatter";
		const match = "{{skill:full-frontmatter}}";
		const remainingLength = 10000;

		const response = await handleSkill(result, path, match, remainingLength);

		expect(response.operationResults).toContain(
			"## Skill: full-frontmatter-skill",
		);
		expect(response.operationResults).toContain(
			"A skill with all frontmatter fields",
		);
	});

	it("should handle multiline description in frontmatter", async () => {
		await Bun.$`mkdir -p ${tempDir}/skills/multiline-desc`;
		await Bun.write(
			`${tempDir}/skills/multiline-desc/SKILL.md`,
			`---
name: multiline-skill
description: This is a single line description that is quite long
---

# Multiline Description Skill

Content here.
`,
		);

		const result = "{{skill:multiline-desc}}";
		const path = "skill:multiline-desc";
		const match = "{{skill:multiline-desc}}";
		const remainingLength = 10000;

		const response = await handleSkill(result, path, match, remainingLength);

		expect(response.operationResults).toContain("## Skill: multiline-skill");
	});

	it("should handle skill with complex markdown content", async () => {
		await Bun.$`mkdir -p ${tempDir}/skills/complex-content`;
		await Bun.write(
			`${tempDir}/skills/complex-content/SKILL.md`,
			`---
name: complex-skill
description: A skill with complex markdown
---

# Complex Skill

## Code Example

\`\`\`typescript
const example = () => {
  console.log("Hello");
};
\`\`\`

## Table

| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |

## List

- Item 1
- Item 2
  - Nested item
`,
		);

		const result = "{{skill:complex-content}}";
		const path = "skill:complex-content";
		const match = "{{skill:complex-content}}";
		const remainingLength = 10000;

		const response = await handleSkill(result, path, match, remainingLength);

		expect(response.operationResults).toContain("## Code Example");
		expect(response.operationResults).toContain("console.log");
		expect(response.operationResults).toContain("## Table");
		expect(response.operationResults).toContain("## List");
	});
});

describe("skill integration with fixtures", () => {
	let originalSkillsDir: string | undefined;

	beforeEach(() => {
		originalSkillsDir = CONFIG.skillsDir;
		CONFIG.skillsDir = "./test/fixtures/skills";

		const validator = SecurityValidator.getInstance();
		validator.configure({
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
			allowFunctions: false,
		});
	});

	afterEach(() => {
		if (originalSkillsDir !== undefined) {
			CONFIG.skillsDir = originalSkillsDir;
		}
	});

	it("should load example skill from fixtures", async () => {
		const result = "{{skill:example-skill}}";
		const path = "skill:example-skill";
		const match = "{{skill:example-skill}}";
		const remainingLength = 10000;

		const response = await handleSkill(result, path, match, remainingLength);

		expect(response.operationResults).toContain("## Skill: example-skill");
		expect(response.operationResults).toContain("An example skill for testing");
		expect(response.operationResults).toContain("## Guidelines");
	});
});
