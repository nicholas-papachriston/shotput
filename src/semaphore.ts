export class Semaphore {
	private permits: number;
	private waitQueue: (() => void)[] = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}

		return new Promise<void>((resolve) => {
			this.waitQueue.push(resolve);
		});
	}

	release(): void {
		this.permits++;
		if (this.waitQueue.length > 0) {
			const resolve = this.waitQueue.shift();
			if (resolve) {
				resolve();
				this.permits--;
			}
		}
	}
}
