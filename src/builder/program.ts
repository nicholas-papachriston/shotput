import {
	runShotput,
	runShotputStreaming,
	runShotputStreamingSegments,
} from "../runtime/engine";
import type {
	ShotputOutput,
	ShotputSegmentStreamOutput,
	ShotputStreamingOutput,
} from "../types";
import { ShotputBase, type ShotputOverrides, mergeOverrides } from "./base";

/**
 * Immutable executable program. Create via shotput().build() or compileShotputTemplate().
 * Chain config setters, then call .run(), .stream(), or .streamSegments() to execute.
 */
export class ShotputProgram extends ShotputBase<ShotputProgram> {
	constructor(private readonly baseOverrides: ShotputOverrides = {}) {
		super();
	}

	protected _merge(overrides: ShotputOverrides): ShotputProgram {
		return new ShotputProgram(mergeOverrides(this.baseOverrides, overrides));
	}

	/**
	 * Return a new program with overrides merged (later overrides win).
	 * Accepts an overrides object for merging multiple keys at once.
	 */
	with(overrides: ShotputOverrides): ShotputProgram {
		return this._merge(overrides);
	}

	/**
	 * Run the full pipeline (postAssembly, preOutput, sectioning). Returns resolved content/sections/messages.
	 */
	run(): Promise<ShotputOutput> {
		return runShotput(this.baseOverrides);
	}

	/**
	 * Stream resolved segments in document order. PostAssembly, preOutput, and sectioning are not run.
	 */
	stream(): Promise<ShotputStreamingOutput> {
		return runShotputStreaming(this.baseOverrides);
	}

	/**
	 * Stream segments with literalMap/literalMapPromise for client-side substitution.
	 */
	streamSegments(): Promise<ShotputSegmentStreamOutput> {
		return runShotputStreamingSegments(this.baseOverrides);
	}
}
