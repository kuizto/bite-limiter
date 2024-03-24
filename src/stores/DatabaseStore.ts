import type { BiteLimiterStore } from '../limiter'

type Operations = {
	insertTimestamp: (key: string, timestamp: number) => Promise<void>
	deleteTimestampsBefore: (oldestValidTimestamp: number) => Promise<void>
	deleteAllTimestampsFor: (key: string) => Promise<void>
	countValidTimestamps: (
		key: string,
		oldestValidTimestamp: number
	) => Promise<number>
}

export class DatabaseStore implements BiteLimiterStore {
	private ops: Operations

	constructor(operations: Operations) {
		this.ops = operations
	}

	public async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now()
		const startWindow = now - windowMs

		// Add a new timestamp for this key
		await this.ops.insertTimestamp(key, now)

		// Remove timestamps outside the current window
		await this.ops.deleteTimestampsBefore(startWindow)

		// Count the number of timestamps within the window for this key
		const count = await this.ops.countValidTimestamps(key, startWindow)

		return count
	}

	public async reset(key: string): Promise<void> {
		await this.ops.deleteAllTimestampsFor(key)
	}
}

export default DatabaseStore
