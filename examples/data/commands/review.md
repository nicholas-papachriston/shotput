---
name: review
description: Assemble code review context
parameters:
  scope:
    type: string
    default: "."
  severity:
    type: string
    default: "all"
---
# Code Review Context

## Scope: {{$scope}}

{{#if params.scope != "."}}
Reviewing path: {{$scope}}
{{/if}}

{{#if params.severity != "all"}}
Severity filter: {{$severity}}
{{/if}}

## Project data
{{../../data/config.json}}
