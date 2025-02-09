# Shotput

Zero dependency plug-and-play templating for JS/TS

## Motivation

Shotput is a simple, programmatic templating library to help manage personas, system prompts, and other text-based configurations for use in any project but particularly for Gen AI applications

## Features

- arbitrary source retrieval
- arbitrary output destination
- templating with:
  - file paths
  - directory paths
  - functions
    - supports:
      - cjs
      - esm
  - http paths
  - glob patterns
  - s3 paths
    - [credential documentation](https://bun.sh/docs/api/s3#credentials)
    - supports the following:
      - AWS S3 - tested
      - Cloudflare R2 - tested
      - DigitalOcean Spaces - untested
      - MinIO - untested
      - Backblaze B2 - untested
  - regex patterns

## TODO

- npm package
- advanced s3/rs credential support
- advanced s3 directory bucket support
- nested documents
- blob search s3/rs support
- regex search s3/rs support
- enhanced in-tree parrallelism before interpolation
  - planning step to determine all files to be interpolated
  - attempt to fetch content length of all files
  - trim files to be interpolated based on content length
  - fetch remaining files in parallel
  - rate limiting + retry handling with configurable exponential backoff

## Usage

Available env vars are found in `env.sh`

The config object is found in `src/config.ts`

In the file format of you choice, simply include any combination of the following to have the file be processed by shotput:

```sh
{{file_path}}

{{dir_path}}

{{relative_file_path}}

{{relative_dir_path}}

{{TemplateType.Function:/path/to/function.js}}

{{/usr/local/app/*.ts}}

{{http://google.com}}

{{s3://path/to/file.json}}

{{s3://path/to/prefix/}}

{{\regex\/g}}
```

!! Priority when determining what files to concatenate follows the order of the template strings in your template file !!

## Prerequisites for Local Use

- `bun`
- `make`

Available commands for local use are found in `Makefile`
