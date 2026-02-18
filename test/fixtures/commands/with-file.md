---
name: with-file
description: Command that includes a file
parameters:
  path:
    type: string
    default: "test.txt"
---
# With file

Content from file:
{{test/fixtures/test.txt}}

Param path was: {{$path}}
