# shotput

simple interface with ollama that uses a static prompt file and a little templating to create living prompts.

## prerequisites

- `bun`
- `make`

## usage

available env vars are found in `env.sh`

available commands are found in `Makefile`

in the file format of you choice, simply include the following to have the file be processed by shotput:

``` sh
{{file_path}}

{{dir_path}}

{{relative_file_path}}

{{relative_dir_path}}
```

## todo

[] templating with globs
[] templating with regex
[] templating with functions
[] historical context injection
[] more generic http based llm api usage (bedrock, etc)
