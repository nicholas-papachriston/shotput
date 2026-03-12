import type { EffectShotputBuilder } from "../effect/builder";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "../types";
import { ShotputBase, type ShotputOverrides, mergeOverrides } from "./base";
import { ShotputProgram } from "./program";

/**
 * Fluent config builder. Chain config setters, call .build() to get a reusable ShotputProgram,
 * or call .run() / .stream() / .streamSegments() directly to execute.
 */
export class ShotputBuilder extends ShotputBase<ShotputBuilder> {
	constructor(private readonly overrides: ShotputOverrides = {}) {
		super();
	}

	protected _merge(overrides: ShotputOverrides): ShotputBuilder {
		return new ShotputBuilder(mergeOverrides(this.overrides, overrides));
	}

	/**
	 * Return a new builder with overrides merged. Accepts an overrides object for merging multiple keys at once.
	 */
	with(overrides: ShotputOverrides): ShotputBuilder {
		return this._merge(overrides);
	}

	/**
	 * Produce an immutable ShotputProgram that can be passed around and executed.
	 */
	build(): ShotputProgram {
		return new ShotputProgram(this.overrides);
	}

	/**
	 * Return a type-mapped builder for Effect-TS interop.
	 * This is a type-only adapter; runtime behavior is unchanged.
	 */
	effect(): EffectShotputBuilder {
		return this as unknown as EffectShotputBuilder;
	}

	/**
	 * Run the full pipeline (same as this.build().run()).
	 */
	run(): Promise<ShotputOutput> {
		return this.build().run();
	}

	/**
	 * Stream resolved segments (same as this.build().stream()).
	 */
	stream(): Promise<ShotputStreamingOutput> {
		return this.build().stream();
	}

	/**
	 * Alias of `.stream()` for stream-first call sites.
	 */
	runStream(): Promise<ShotputStreamingOutput> {
		return this.stream();
	}

	/**
	 * Stream segments with literalMap (same as this.build().streamSegments()).
	 */
	streamSegments(): Promise<ShotputSegmentStreamOutput> {
		return this.build().streamSegments();
	}
}
