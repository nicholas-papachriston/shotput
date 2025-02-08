# shotput

zero dependency plug-and-play templating

## features

- arbitrary source retrieval
- arbitrary output destination
- templating with:
  - file paths
  - directory paths
  - glob patterns
  - regex
  - s3 paths
  - http paths

## todo

- templating with functions
- npm package
- documentation

## usage

available env vars/config object are found in `src/config.ts`

available commands for local use are found in `Makefile`

in the file format of you choice, simply include the following to have the file be processed by shotput:

``` sh
{{file_path}}

{{dir_path}}

{{relative_file_path}}

{{relative_dir_path}}

{{/usr/local/app/*.ts}}

{{s3://path/to/file}}

{{\regex\/g}}
```

## prerequisites for local use

- `bun`
- `make`
