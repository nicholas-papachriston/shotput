# Best Practices Reference

This reference document provides additional best practices for skill development and usage.

## Skill Structure

### Required Files

- `SKILL.md` - Main skill file with YAML frontmatter and instructions

### Optional Files

- `reference/` - Directory containing additional reference materials
- `scripts/` - Directory containing helper scripts
- `LICENSE.txt` - License information

## Frontmatter Format

The YAML frontmatter must include:

```yaml
---
name: your-skill-name
description: A clear description of what the skill does
---
```

Optional frontmatter fields:

```yaml
---
name: your-skill-name
description: A clear description
license: Apache 2.0
---
```

## Content Guidelines

1. **Be Specific**: Provide clear, actionable instructions
2. **Use Examples**: Include practical examples that demonstrate usage
3. **Structure Content**: Use markdown headings to organize information
4. **Keep It Focused**: Each skill should have a single, clear purpose

## Integration Tips

- Skills can be loaded using the `{{skill:name}}` syntax
- Use `:full` suffix to include reference materials: `{{skill:name:full}}`
- Remote skills can be loaded with `github:owner/repo/skill-name`

## Security Considerations

- Skills are validated against allowed base paths
- Remote skills require `allowRemoteSkills: true` configuration
- Only approved skill sources can be loaded when `allowedSkillSources` is configured