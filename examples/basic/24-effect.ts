// bun run examples/basic/24-effect.ts
import { Effect, Stream, pipe } from "effect";
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

const runEffect = pipe(
	Effect.tryPromise({
		try: () => base.run(),
		catch: classifyError,
	}),
	Effect.flatMap((output) =>
		output.error !== undefined
			? Effect.fail(classifyError(output.error))
			: Effect.succeed(output),
	),
);

const runStreamEffect = pipe(
	Effect.tryPromise({
		try: () => base.runStream(),
		catch: classifyError,
	}),
	Effect.flatMap((output) =>
		output.error !== undefined
			? Effect.fail(classifyError(output.error))
			: Effect.succeed(output),
	),
);

const textStream = Stream.unwrap(
	pipe(
		runStreamEffect,
		Effect.map((output) =>
			Stream.fromReadableStream(() => output.stream, classifyError),
		),
	),
);

const [runtimeOutput, streamedOutput] = await Promise.all([
	Effect.runPromise(runEffect),
	Effect.runPromise(
		Stream.runFold(textStream, "", (acc, chunk) => acc + chunk),
	),
]);

console.log("Typed adapter validated and Effect runtime interop executed.");
console.log("run() output via Effect.runPromise:", runtimeOutput.content);
console.log("runStream() output via Effect Stream:", streamedOutput);
