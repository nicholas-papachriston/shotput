import { describe, expect, it } from "bun:test";
import { Effect, Stream, pipe } from "effect";
import { shotput } from "../../src";
import type { ShotputOutput, ShotputStreamingOutput } from "../../src/types";
import type {
	EffectShotputBuilder,
	ShotputEffect,
	ShotputEffectError,
} from "../../src/effect";
import { classifyError } from "../../src/effect";
import { HookAbortError } from "../../src/hooks";

describe("effect interop", () => {
	it("provides type-mapped builder signatures", () => {
		const base = shotput().template("Hello {{context.name}}").context({
			name: "Effect",
		});
		const typedBuilder: EffectShotputBuilder = base.effect();

		const typedRun = typedBuilder.run();
		const _typedAsEffect: ShotputEffect<ShotputOutput, ShotputEffectError> =
			typedRun;
		const typedRunStream = typedBuilder.runStream();
		const _typedStreamAsEffect: ShotputEffect<
			ShotputStreamingOutput,
			ShotputEffectError
		> = typedRunStream;

		expect(_typedAsEffect).toBeDefined();
		expect(_typedStreamAsEffect).toBeDefined();
	});

	it("supports practical Effect interop for run and stream", async () => {
		const base = shotput()
			.template("Hello {{context.name}} from Effect tests.")
			.context({ name: "Shotput" });

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

		const [runOutput, streamedOutput] = await Promise.all([
			Effect.runPromise(runEffect),
			Effect.runPromise(Stream.runFold(textStream, "", (acc, chunk) => acc + chunk)),
		]);

		expect(runOutput.content).toBe("Hello Shotput from Effect tests.");
		expect(streamedOutput).toBe("Hello Shotput from Effect tests.");
	});

	it("classifyError tags HookAbortError distinctly", () => {
		const error = new HookAbortError("aborted");
		const classified = classifyError(error);

		expect(classified._tag).toBe("ShotputHookAbortError");
		expect(classified.message).toBe("aborted");
	});
});
