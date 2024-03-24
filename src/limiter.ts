export interface BiteLimiterStore {
	increment(key: string, windowMs: number): Promise<number>
	reset(key: string): Promise<void>
}

export class BiteLimiter {
	private limit: number
	private store: BiteLimiterStore
	private windowMs: number
	private prefix?: string

	constructor(options: {
		limit: number
		store: BiteLimiterStore
		windowMs?: number
		prefix?: string
	}) {
		this.prefix = options.prefix
		this.windowMs = options.windowMs ?? 1000
		this.limit = options.limit
		this.store = options.store
	}

	async check(id = 'global'): Promise<{ ok: boolean; remaining: number }> {
		const key = this.prefix ? `${this.prefix}:${id}` : id
		const count = await this.store.increment(key, this.windowMs)

		return {
			ok: count <= this.limit,
			remaining: Math.max(this.limit - count, 0)
		}
	}

	async reset(id = 'global'): Promise<void> {
		const key = this.prefix ? `${this.prefix}:${id}` : id
		await this.store.reset(key)
	}
}

export default BiteLimiter
