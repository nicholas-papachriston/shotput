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
Scope is {{$scope}}
{{/if}}

{{#if params.severity != "all"}}
Severity filter: {{$severity}}
{{/if}}
