import type { ShotputOverrides } from "../builder/base";
import type { ShotputBuilder } from "../builder/builder";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "../types";
import type { ShotputEffect } from "./program";
import type { EffectShotputProgram } from "./program";

export interface EffectShotputBuilder
	extends Omit<
		ShotputBuilder,
		| "with"
		| "build"
		| "run"
		| "stream"
		| "runStream"
		| "streamSegments"
		| "effect"
	> {
	with(overrides: ShotputOverrides): EffectShotputBuilder;
	build(): EffectShotputProgram;
	run(): ShotputEffect<ShotputOutput>;
	stream(): ShotputEffect<ShotputStreamingOutput>;
	runStream(): ShotputEffect<ShotputStreamingOutput>;
	streamSegments(): ShotputEffect<ShotputSegmentStreamOutput>;
}
