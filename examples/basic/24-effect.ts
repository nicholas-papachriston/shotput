// bun run examples/basic/24-effect.ts
import { Effect, Match, Stream, pipe } from "effect";
import { shotput } from "../../src";
import type {
	EffectShotputBuilder,
	ShotputEffect,
	ShotputEffectError,
} from "../../src/effect";
import { classifyError } from "../../src/effect";
import type { ShotputOutput, ShotputStreamingOutput } from "../../src/types";

const base = shotput()
	.template("Hello {{context.name}} from Effect type-mapping mode.")
	.context({ name: "Shotput" });

const typedBuilder: EffectShotputBuilder = base.effect();

const typedRun = typedBuilder.run();
const _typedAsEffect: ShotputEffect<ShotputOutput, ShotputEffectError> =
	typedRun;
const typedRunStream = typedBuilder.runStream();
const _typedStreamAsEffect: ShotputEffect<
	ShotputStreamingOutput,
	ShotputEffectError
> = typedRunStream;

const succeedUnlessOutputError = <A extends { readonly error?: unknown }>(
	output: A,
) =>
	Match.value(output.error).pipe(
		Match.when(Match.undefined, () => Effect.succeed(output)),
		Match.orElse((error) => Effect.fail(classifyError(error))),
	);

const runEffect = pipe(
	Effect.tryPromise({
		try: () => base.run(),
		catch: classifyError,
	}),
	Effect.flatMap(succeedUnlessOutputError),
);

const runStreamEffect = pipe(
	Effect.tryPromise({
		try: () => base.runStream(),
		catch: classifyError,
	}),
	Effect.flatMap(succeedUnlessOutputError),
);

const textStream = Stream.unwrap(
	pipe(
		runStreamEffect,
		Effect.map((output) =>
			Stream.fromReadableStream({
				evaluate: () => output.stream,
				onError: classifyError,
			}),
		),
	),
);

const [runtimeOutput, streamedOutput] = await Promise.all([
	Effect.runPromise(runEffect),
	Effect.runPromise(
		Stream.runFold(
			textStream,
			() => "",
			(acc, chunk) => acc + chunk,
		),
	),
]);

console.log("Typed adapter validated and Effect runtime interop executed.");
console.log("run() output via Effect.runPromise:", runtimeOutput.content);
console.log("runStream() output via Effect Stream:", streamedOutput);
