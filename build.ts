await Bun.build({
	entrypoints: ["./src/index.ts"],
	outdir: "./dist",
	minify: true,
	sourcemap: "external",
	target: "bun",
	naming: {
		entry: "index.js",
		chunk: "[name].[hash].js",
	},
});
