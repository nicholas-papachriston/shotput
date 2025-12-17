---
name: demo-skill
description: A comprehensive demo skill showcasing the Anthropic Skills format for Shotput templates
version: 1.0.0
author: Shotput Examples
tags: [demo, example, documentation]
---

# Demo Skill

This is a demonstration skill that shows how to structure and use Anthropic Skills with Shotput templating.

## Overview

Skills in Shotput follow the Anthropic Skills format, which allows you to package reusable instructions, guidelines, and context into structured documents that can be easily included in templates.

## What is a Skill?

A skill is a markdown document with YAML frontmatter that contains:
- **Instructions**: Step-by-step guidance for specific tasks
- **Guidelines**: Best practices and principles to follow
- **Context**: Background information and domain knowledge
- **Examples**: Practical demonstrations and use cases
- **References**: Supporting documentation and resources

## Using This Skill

Include this skill in your template using:

```markdown
{{skill:demo-skill}}
```

Or include it with reference materials:

```markdown
{{skill:demo-skill:full}}
```

## Core Principles

### 1. Clarity and Precision
- Use clear, unambiguous language
- Provide specific, actionable instructions
- Define terms and concepts explicitly

### 2. Structured Information
- Organize content with clear headings
- Use bullet points for lists
- Include examples for complex concepts

### 3. Completeness
- Cover all necessary aspects of the topic
- Include edge cases and exceptions
- Provide troubleshooting guidance

## Example Use Cases

### Use Case 1: System Prompts
Skills are excellent for packaging system prompts and personas:

```
You are an expert software engineer with deep knowledge of:
- Modern web development practices
- API design and implementation
- Database optimization
- Security best practices

Your responses should be:
- Technically accurate
- Well-structured and organized
- Include practical examples
- Consider edge cases
```

### Use Case 2: Brand Guidelines
Include brand voice and style guidelines:

- **Tone**: Professional yet approachable
- **Language**: Clear and concise
- **Format**: Structured with headings and lists
- **Examples**: Always provide practical demonstrations

### Use Case 3: Technical Standards
Document coding standards and conventions:

```typescript
// Function naming: Use camelCase
function processUserData(userData: UserData): ProcessedData {
  // Implementation
}

// Constants: Use UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Interfaces: Use PascalCase with 'I' prefix optional
interface UserData {
  id: string;
  name: string;
}
```

## Advanced Features

### Conditional Content
Skills can include environment-specific content:

- Development: Include verbose logging and debugging info
- Staging: Include performance monitoring
- Production: Include error handling and resilience patterns

### Composition
Skills can reference other skills or documents:

- Import shared definitions
- Extend base skills with specific variations
- Combine multiple skills for complex tasks

### Versioning
Track skill versions for:

- Compatibility with different system versions
- Rollback capabilities
- Change history tracking

## Best Practices

### Writing Skills

1. **Start with Purpose**: Clearly state what the skill provides
2. **Structure Logically**: Organize content in a clear hierarchy
3. **Include Examples**: Show, don't just tell
4. **Keep Updated**: Regularly review and update skills
5. **Test Thoroughly**: Validate skills work as intended

### Using Skills

1. **Reference by Name**: Use consistent skill naming
2. **Version Awareness**: Know which version you're using
3. **Combine Thoughtfully**: Be deliberate when mixing multiple skills
4. **Monitor Performance**: Track skill effectiveness
5. **Iterate**: Improve skills based on outcomes

## Template Integration Examples

### Example 1: Basic Inclusion
```markdown
# Project Context

{{skill:demo-skill}}

# Additional Information

{{./project-specific-context.md}}
```

### Example 2: Multiple Skills
```markdown
# Complete System Prompt

## Brand Voice
{{skill:brand-guidelines}}

## Technical Standards
{{skill:coding-standards}}

## Domain Knowledge
{{skill:demo-skill:full}}
```

### Example 3: Mixed Sources
```markdown
# AI Assistant Configuration

## Core Instructions
{{skill:demo-skill}}

## API Documentation
{{https://api.example.com/docs}}

## Recent Examples
{{./examples/*.md}}
```

## Troubleshooting

### Skill Not Found
- Verify the skill name is correct
- Check the skillsDir configuration
- Ensure SKILL.md file exists in skill directory

### Content Not Appearing
- Verify template syntax: {{skill:name}}
- Check for typos in skill name
- Review debug output if enabled

### Remote Skills Not Loading
- Ensure allowRemoteSkills: true in configuration
- Verify network connectivity
- Check allowedSkillSources includes the source

## Reference Files

Skills can include reference files in a `reference/` subdirectory:

```
skills/
  demo-skill/
    SKILL.md          # This file
    reference/
      examples.md     # Example reference file
      guidelines.md   # Additional guidelines
      api-spec.yaml   # API specifications
```

Access with `:full` suffix to include references:
```markdown
{{skill:demo-skill:full}}
```

## Metadata

- **Created**: 2024-01-20
- **Last Updated**: 2024-01-20
- **Compatibility**: Shotput v1.0+
- **Status**: Stable

## Additional Resources

- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Shotput Documentation](../../../README.md)
- [Template Syntax Guide](../../../docs/)

## Summary

Skills provide a powerful way to package and reuse knowledge, instructions, and context in your templates. They enable:

- ✅ Consistent prompt engineering
- ✅ Reusable documentation
- ✅ Version-controlled context
- ✅ Collaborative knowledge sharing
- ✅ Maintainable system prompts

Use skills to build better, more maintainable AI applications with Shotput!