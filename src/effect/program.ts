import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ShotputOverrides } from "../builder/base";
import type { ShotputProgram } from "../builder/program";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "../types";
import type { ShotputEffectError } from "./errors";

export type ShotputEffect<A, E = ShotputEffectError> = Effect.Effect<
	A,
	E,
	never
>;

export type ShotputEffectStream<A, E = ShotputEffectError> = Stream.Stream<
	A,
	E,
	never
>;

export interface EffectShotputProgram
	extends Omit<
		ShotputProgram,
		"with" | "run" | "stream" | "runStream" | "streamSegments" | "effect"
	> {
	with(overrides: ShotputOverrides): EffectShotputProgram;
	run(): ShotputEffect<ShotputOutput>;
	stream(): ShotputEffect<ShotputStreamingOutput>;
	runStream(): ShotputEffect<ShotputStreamingOutput>;
	streamSegments(): ShotputEffect<ShotputSegmentStreamOutput>;
}
