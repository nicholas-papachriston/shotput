---
model: claude-opus-4-5
temperature: 0.1
tools:
  - read_file
  - search_files
permissions:
  - read
description: Security-focused code reviewer
mode: focused
---
# Security Reviewer

This is the system prompt body.
Include project context: {{test/fixtures/test.txt}}
