#!/usr/bin/env bun

/**
 * Example 08: Anthropic Skills
 *
 * This example demonstrates using Anthropic Skills format in templates.
 * Skills provide a structured way to package reusable instructions,
 * guidelines, and context for AI applications and documentation.
 *
 * Usage:
 *   bun run examples/basic/08-skills.ts
 */

import { shotput } from "../../src/index";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getLogger } from "../../src/logger";

const log = getLogger("08-skills");
// Setup: Create template directory
const templateDir = join(import.meta.dir, "../output/08-skills");
mkdirSync(templateDir, { recursive: true });

// Step 1: Create a template that uses skills
const templateContent = `# AI Assistant Configuration

## Core Instructions (from Skill)

{{skill:demo-skill}}

## Additional Context

This configuration combines the demo skill with project-specific information.

Project: Shotput Examples
Version: 1.0.0
Environment: Development

## Static Guidelines

- Always provide clear, actionable responses
- Include practical examples
- Consider edge cases
- Maintain consistent formatting

---

Skills provide powerful, reusable context management!
`;

const templatePath = join(templateDir, "template.md");
writeFileSync(templatePath, templateContent);

try {
  const result = await shotput({
    templateDir,
    templateFile: "template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    skillsDir: join(import.meta.dir, "../skills"),
    debug: true,
    debugFile: join(templateDir, "template-debug.md"),
  });

  log.info(result.content?.substring(0, 2000));

  const fullTemplate = `# Complete Skill Documentation

## Main Skill Content

{{skill:demo-skill:full}}

---

The :full suffix includes the skill's reference materials.
`;

  const fullTemplatePath = join(templateDir, "full-template.md");
  writeFileSync(fullTemplatePath, fullTemplate);

  const fullResult = await shotput({
    templateDir,
    templateFile: "full-template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    skillsDir: join(import.meta.dir, "../skills"),
    debug: true,
    debugFile: join(templateDir, "full-template-debug.md"),
  });

  log.info(fullResult.content?.substring(0, 2000));

  const multiTemplate = `# Multi-Skill Configuration

## Skill 1: Demo Skill

{{skill:demo-skill}}

## Skill 2: Demo Skill with References

{{skill:demo-skill:full}}

## Additional Files

{{../data/config.json}}

---

Multiple skills can be combined in a single template.
`;

  const multiTemplatePath = join(templateDir, "multi-template.md");
  writeFileSync(multiTemplatePath, multiTemplate);

  const multiResult = await shotput({
    templateDir,
    templateFile: "multi-template.md",
    responseDir: templateDir,
    allowedBasePaths: [join(import.meta.dir, "..")],
    skillsDir: join(import.meta.dir, "../skills"),
    debug: true,
    debugFile: join(templateDir, "multi-template-debug.md"),
  });

  log.info(multiResult.content);
} catch (error) {
  log.error(error);
  log.error("Possible causes:");
  log.error("- Skill not found in skillsDir");
  log.error("- SKILL.md file missing in skill directory");
  log.error("- Invalid skill syntax in template");
  log.error("- skillsDir not configured");

}

/**
 * Key Takeaways:
 *
 * 1. Skill Syntax:
 *    - Basic: {{skill:skill-name}}
 *    - With references: {{skill:skill-name:full}}
 *    - Remote (GitHub): {{skill:github:org/repo/skill-name}}
 *
 * 2. Configuration:
 *    - MUST set skillsDir to the directory containing skills
 *    - Set allowRemoteSkills: true to enable GitHub skills
 *    - Use allowedSkillSources to whitelist remote sources
 *
 * 3. Skill Structure:
 *    skills/
 *      skill-name/
 *        SKILL.md          # Required: Main skill content with YAML frontmatter
 *        reference/        # Optional: Additional reference materials
 *          file1.md
 *          file2.md
 *
 * 4. SKILL.md Format:
 *    ---
 *    name: skill-name
 *    description: Brief description
 *    version: 1.0.0
 *    ---
 *
 *    # Skill Content
 *    ...
 *
 * 5. Reference Files:
 *    - Place in reference/ subdirectory within skill directory
 *    - Included automatically when using :full suffix
 *    - Can be any text format (md, txt, json, etc.)
 *
 * 6. Remote Skills (GitHub):
 *    - Requires allowRemoteSkills: true
 *    - Syntax: {{skill:github:owner/repo/path/to/skill}}
 *    - Must be in allowedSkillSources list
 *    - Example: {{skill:github:anthropics/skills/brand-guidelines}}
 *
 * 7. Use Cases:
 *    - System prompts for AI applications
 *    - Persona definitions
 *    - Brand voice guidelines
 *    - Technical standards
 *    - Domain knowledge
 *    - Reusable instructions
 *
 * 8. Best Practices:
 *    - Use semantic skill names (kebab-case)
 *    - Include clear descriptions in YAML frontmatter
 *    - Version your skills for compatibility tracking
 *    - Keep skills focused on single concerns
 *    - Document skill dependencies
 *    - Test skills independently
 *
 * 9. Combining with Other Features:
 *    - Skills can be mixed with files, functions, HTTP, etc.
 *    - Processing order follows template order
 *    - Each skill is treated as a separate template item
 *
 * 10. Security:
 *     - Local skills are restricted to skillsDir
 *     - Remote skills require explicit allowlist
 *     - Skills are loaded at template processing time
 *     - No code execution from skills (unless they reference functions)
 *
 * 11. Performance:
 *     - Skills are cached during a single run
 *     - Multiple references to same skill use cached version
 *     - :full suffix loads all reference files
 *     - Consider skill size when using :full
 *
 * 12. Troubleshooting:
 *     - "Skill not found" → Check skill name and skillsDir path
 *     - "Remote skills disabled" → Set allowRemoteSkills: true
 *     - "Source not allowed" → Add to allowedSkillSources
 *     - Empty output → Verify SKILL.md exists and has content
 */
