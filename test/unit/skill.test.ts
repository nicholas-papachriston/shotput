import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createConfig } from "../../src/config";

import { SKILL_TEMPLATE, handleSkill } from "../../src/skill";

describe("handleSkill", () => {
	let tempDir: string;
	const originalFetch = global.fetch;

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-skill-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}/skills/test-skill`;
		await Bun.$`mkdir -p ${tempDir}/skills/test-skill-with-refs/reference`;

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
	});

	afterEach(async () => {
		global.fetch = originalFetch;
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("local skill loading", () => {
		it("should load a basic local skill", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "Before {{skill:test-skill}} After";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("Before");
			expect(response.operationResults).toContain("After");
			expect(response.operationResults).toContain("## Skill: test-skill");
			expect(response.operationResults).toContain(
				"A test skill for unit testing",
			);
			expect(response.operationResults).toContain("Test Skill Instructions");
			expect(response.combinedRemainingCount).toBeGreaterThan(0);
		});

		it("should handle missing skill gracefully", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:nonexistent-skill}}";
			const path = "skill:nonexistent-skill";
			const match = "{{skill:nonexistent-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("[Error loading skill:");
			expect(response.combinedRemainingCount).toBe(remainingLength);
		});

		it("should handle invalid skill format", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

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

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("[Error loading skill:");
		});

		it("should handle missing name in frontmatter", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

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

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("[Error loading skill:");
		});
	});

	describe("skill path parsing", () => {
		it("should handle skill path without skill: prefix", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{test-skill}}";
			const path = "test-skill";
			const match = "{{test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("## Skill: test-skill");
		});

		it("should load a skill with reference files", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:test-skill-with-refs}}";
			const path = "skill:test-skill-with-refs";
			const match = "{{skill:test-skill-with-refs}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain(
				"## Skill: test-skill-with-refs",
			);
		});

		it("should include local reference content when using :full", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const response = await handleSkill(
				config,
				"{{skill:test-skill-with-refs:full}}",
				"skill:test-skill-with-refs:full",
				"{{skill:test-skill-with-refs:full}}",
				10000,
			);

			expect(response.operationResults).toContain("## Skill References");
			expect(response.operationResults).toContain("### Reference: guide.md");
			expect(response.operationResults).toContain("### Reference: examples.md");
		});

		it("should skip local references silently when :full has no reference directory", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const response = await handleSkill(
				config,
				"{{skill:test-skill:full}}",
				"skill:test-skill:full",
				"{{skill:test-skill:full}}",
				10000,
			);

			expect(response.operationResults).toContain("## Skill: test-skill");
			expect(response.operationResults).not.toContain("## Skill References");
		});
	});

	describe("remote skill loading", () => {
		it("should block remote skills when disabled", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowRemoteSkills: false,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:github:anthropics/skills/brand-guidelines}}";
			const path = "skill:github:anthropics/skills/brand-guidelines";
			const match = "{{skill:github:anthropics/skills/brand-guidelines}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("[Security Error:");
			expect(response.operationResults).toContain(
				"Remote skill loading is disabled",
			);
		});

		it("should handle invalid github path format", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowRemoteSkills: true,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:github:invalid-path}}";
			const path = "skill:github:invalid-path";
			const match = "{{skill:github:invalid-path}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.operationResults).toContain("[Error loading skill:");
		});

		it("should reject remote source not in allowed list", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowRemoteSkills: true,
				allowedSkillSources: ["anthropics/skills"],
				allowedBasePaths: [process.cwd(), tempDir],
			});

			const response = await handleSkill(
				config,
				"{{skill:github:badorg/badrepo/skill-name}}",
				"skill:github:badorg/badrepo/skill-name",
				"{{skill:github:badorg/badrepo/skill-name}}",
				10000,
			);

			expect(response.operationResults).toContain("[Security Error:");
		});

		it("should load remote skill and include remote references with :full", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowRemoteSkills: true,
				allowedSkillSources: ["anthropics/skills"],
				allowedBasePaths: [process.cwd(), tempDir],
			});

			global.fetch = (async (url: string | URL) => {
				const urlStr = String(url);
				if (urlStr.endsWith("/SKILL.md")) {
					return new Response(
						`---
name: remote-skill
description: Remote description
---

# Remote skill body`,
						{ status: 200 },
					);
				}
				if (urlStr.endsWith("/reference/mcp_best_practices.md")) {
					return new Response("# MCP Best Practices", { status: 200 });
				}
				if (urlStr.endsWith("/reference/python_mcp_server.md")) {
					return new Response("Not found", { status: 404 });
				}
				// Simulate transport error path for one reference file
				if (urlStr.endsWith("/reference/node_mcp_server.md")) {
					throw new Error("network");
				}
				return new Response("Not found", { status: 404 });
			}) as typeof fetch;

			const response = await handleSkill(
				config,
				"{{skill:github:anthropics/skills/remote-skill:full}}",
				"skill:github:anthropics/skills/remote-skill:full",
				"{{skill:github:anthropics/skills/remote-skill:full}}",
				10000,
			);

			expect(response.operationResults).toContain("## Skill: remote-skill");
			expect(response.operationResults).toContain("Remote description");
			expect(response.operationResults).toContain("## Skill References");
			expect(response.operationResults).toContain(
				"### Reference: mcp_best_practices.md",
			);
			expect(response.operationResults).not.toContain(
				"### Reference: python_mcp_server.md",
			);
		});

		it("should return error when remote skill fetch returns non-ok", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowRemoteSkills: true,
				allowedSkillSources: ["anthropics/skills"],
				allowedBasePaths: [process.cwd(), tempDir],
			});

			global.fetch = (async () =>
				new Response("nope", {
					status: 500,
					statusText: "Internal Error",
				})) as typeof fetch;

			const response = await handleSkill(
				config,
				"{{skill:github:anthropics/skills/broken-skill}}",
				"skill:github:anthropics/skills/broken-skill",
				"{{skill:github:anthropics/skills/broken-skill}}",
				10000,
			);

			expect(response.operationResults).toContain("[Error loading skill:");
			expect(response.operationResults).toContain(
				"github:anthropics/skills/broken-skill",
			);
			expect(response.combinedRemainingCount).toBe(10000);
		});
	});

	describe("content processing", () => {
		it("should truncate skill content when length limit is reached", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:test-skill}}";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 50;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.combinedRemainingCount).toBe(0);
			expect(response.operationResults.length).toBeLessThan(200);
		});

		it("should handle zero remaining length", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "{{skill:test-skill}}";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 0;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

			expect(response.combinedRemainingCount).toBe(0);
		});

		it("should replace the correct match placeholder", async () => {
			const config = createConfig({
				skillsDir: `${tempDir}/skills`,
				allowedBasePaths: [process.cwd(), tempDir],
				allowHttp: false,
				allowFunctions: false,
			});

			const result = "Start {{other}} {{skill:test-skill}} {{another}} End";
			const path = "skill:test-skill";
			const match = "{{skill:test-skill}}";
			const remainingLength = 10000;

			const response = await handleSkill(
				config,
				result,
				path,
				match,
				remainingLength,
			);

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

	beforeEach(async () => {
		tempDir = `${process.cwd()}/test-temp-skill-parse-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}/skills`;
	});

	afterEach(async () => {
		try {
			await Bun.$`rm -rf ${tempDir}`;
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should parse skill with all frontmatter fields", async () => {
		const config = createConfig({
			skillsDir: `${tempDir}/skills`,
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

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

		const response = await handleSkill(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain(
			"## Skill: full-frontmatter-skill",
		);
		expect(response.operationResults).toContain(
			"A skill with all frontmatter fields",
		);
	});

	it("should handle multiline description in frontmatter", async () => {
		const config = createConfig({
			skillsDir: `${tempDir}/skills`,
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

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

		const response = await handleSkill(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("## Skill: multiline-skill");
	});

	it("should handle skill with complex markdown content", async () => {
		const config = createConfig({
			skillsDir: `${tempDir}/skills`,
			allowedBasePaths: [process.cwd(), tempDir],
			allowHttp: false,
			allowFunctions: false,
		});

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

		const response = await handleSkill(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("## Code Example");
		expect(response.operationResults).toContain("console.log");
		expect(response.operationResults).toContain("## Table");
		expect(response.operationResults).toContain("## List");
	});

	it("should return error for invalid frontmatter YAML", async () => {
		const config = createConfig({
			skillsDir: `${tempDir}/skills`,
			allowedBasePaths: [process.cwd(), tempDir],
		});
		await Bun.$`mkdir -p ${tempDir}/skills/bad-yaml`;
		await Bun.write(
			`${tempDir}/skills/bad-yaml/SKILL.md`,
			`---
name: bad-yaml
description [oops
---
content`,
		);

		const response = await handleSkill(
			config,
			"{{skill:bad-yaml}}",
			"skill:bad-yaml",
			"{{skill:bad-yaml}}",
			10000,
		);

		expect(response.operationResults).toContain("[Error loading skill:");
		expect(response.operationResults).toContain("bad-yaml");
		expect(response.combinedRemainingCount).toBe(10000);
	});

	it("should return error when frontmatter parses to non-object", async () => {
		const config = createConfig({
			skillsDir: `${tempDir}/skills`,
			allowedBasePaths: [process.cwd(), tempDir],
		});
		await Bun.$`mkdir -p ${tempDir}/skills/non-object-frontmatter`;
		await Bun.write(
			`${tempDir}/skills/non-object-frontmatter/SKILL.md`,
			`---
- item
---
content`,
		);

		const response = await handleSkill(
			config,
			"{{skill:non-object-frontmatter}}",
			"skill:non-object-frontmatter",
			"{{skill:non-object-frontmatter}}",
			10000,
		);

		expect(response.operationResults).toContain("[Error loading skill:");
		expect(response.operationResults).toContain("non-object-frontmatter");
		expect(response.combinedRemainingCount).toBe(10000);
	});
});

describe("skill integration with fixtures", () => {
	beforeEach(() => {});

	it("should load the example-skill fixture", async () => {
		const config = createConfig({
			skillsDir: "./test/fixtures/skills",
			allowedBasePaths: [process.cwd()],
			allowHttp: false,
			allowFunctions: false,
		});

		const result = "{{skill:example-skill}}";
		const path = "skill:example-skill";
		const match = "{{skill:example-skill}}";
		const remainingLength = 10000;

		const response = await handleSkill(
			config,
			result,
			path,
			match,
			remainingLength,
		);

		expect(response.operationResults).toContain("## Skill: example-skill");
		expect(response.operationResults).toContain("An example skill for testing");
		expect(response.operationResults).toContain("## Guidelines");
	});
});
