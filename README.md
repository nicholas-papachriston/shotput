# shotput

zero dependency plug-and-play prompt templating

## features

- arbitrary source retrieval
- arbitrary output destination
- templating with:
  - file paths
  - directory paths
  - functions
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

## todo

- nested documents
- npm package
- documentation
- refactor `findTemplateType`

## usage

available env vars/config object are found in `src/config.ts`

available commands for local use are found in `Makefile`

in the file format of you choice, simply include any combination of the following to have the file be processed by shotput:

``` sh
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

## prerequisites for local use

- `bun`
- `make`
