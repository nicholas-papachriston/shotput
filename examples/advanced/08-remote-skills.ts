#!/usr/bin/env bun

/**
 * Example 08: Remote Skills from GitHub
 *
 * This example demonstrates loading Anthropic Skills from GitHub repositories.
 * Remote skills allow you to use pre-built skill packages without local copies.
 *
 * Prerequisites:
 *   - Enable allowRemoteSkills: true
 *   - Configure allowedSkillSources with trusted organizations
 *
 * Usage:
 *   bun run examples/advanced/08-remote-skills.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("08-remote-skills");
const templateDir = join(import.meta.dir, "../output/08-remote-skills");
const skillsDir = join(import.meta.dir, "../skills");
mkdirSync(templateDir, { recursive: true });
mkdirSync(skillsDir, { recursive: true });

// Create a local skill for comparison
const localSkillContent = `# Local Skill Example

This is a local skill stored in the skills directory.

## Features

- Always available
- No network required
- Fast loading
- Private/proprietary content

## Usage

Include in templates with: {{skill:local-example}}
`;

const localSkillPath = join(skillsDir, "local-example", "README.md");
mkdirSync(join(skillsDir, "local-example"), { recursive: true });
writeFileSync(localSkillPath, localSkillContent);

const comparisonTemplate = `# Skills Comparison

## Local Skill
{{skill:local-example}}

## Remote Skill from Anthropic (if enabled)
{{skill:github:anthropics/skills/brand-guidelines}}

## Another Remote Skill
{{skill:github:anthropics/skills/mcp-builder}}
`;

const comparisonPath = join(templateDir, "comparison-template.md");
writeFileSync(comparisonPath, comparisonTemplate);

try {
  const result = await shotput({
    templateDir,
    templateFile: "comparison-template.md",
    responseDir: templateDir,
    skillsDir,
    allowRemoteSkills: true,
    allowedSkillSources: ["anthropics/skills"],
    allowHttp: true, // Required for fetching remote skills
    allowedBasePaths: [skillsDir, templateDir, join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "comparison-debug.md"),
  });

  log.info(result.content);
} catch (error) {
  log.error("Comparison failed:", error);
}

const referencesTemplate = `# Skills with References

## Basic skill (README only)
{{skill:github:anthropics/skills/brand-guidelines}}

## Skill with all references included
{{skill:github:anthropics/skills/mcp-builder:full}}
`;

const referencesPath = join(templateDir, "references-template.md");
writeFileSync(referencesPath, referencesTemplate);

try {
  const result = await shotput({
    templateDir,
    templateFile: "references-template.md",
    responseDir: templateDir,
    skillsDir,
    allowRemoteSkills: true,
    allowedSkillSources: ["anthropics/skills"],
    allowHttp: true,
    maxPromptLength: 200000, // Larger limit for full skill content
    allowedBasePaths: [skillsDir, templateDir, join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "references-debug.md"),
  });

  log.info(result.content);
} catch (error) {
  log.error("References example failed:", error);
}

const secureTemplate = `# Secure Skills Loading

## Allowed: Trusted organization
{{skill:github:anthropics/skills/brand-guidelines}}

## Would fail: Untrusted organization
{{skill:github:random-org/untrusted-repo/skill}}

## Would fail: Remote skills disabled
(If allowRemoteSkills: false)
`;
writeFileSync(secureTemplate, secureTemplate);

try {
  const result = await shotput({
    templateDir,
    templateFile: "secure-template.md",
    responseDir: templateDir,
    skillsDir,
    allowRemoteSkills: true,
    // Only allow specific trusted organizations
    allowedSkillSources: [
      "anthropics/skills",
      "myorg/skills",
      "trusted-partner/skills"
    ],
    allowHttp: true,
    allowedBasePaths: [skillsDir, templateDir, join(import.meta.dir, "..")],
    debug: true,
    debugFile: join(templateDir, "secure-debug.md"),
  });

  log.info(result.content);
} catch (error) {
  log.error("Security example failed:", error);
}

/**
 * Key Takeaways:
 *
 * 1. Remote skills fetch from GitHub repositories
 * 2. Format: {{skill:github:org/repo/skill-name}}
 * 3. Use :full suffix to include reference files
 * 4. Must enable allowRemoteSkills: true
 * 5. Use allowedSkillSources to whitelist trusted orgs
 * 6. Remote skills require allowHttp: true
 * 7. Disable remote skills in production for security
 * 8. Cache remote skills locally for production use
 * 9. Local skills are faster and more secure
 * 10. Use remote skills during development for convenience
 */
