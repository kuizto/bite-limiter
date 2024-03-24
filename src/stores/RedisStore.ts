import type { BiteLimiterStore } from '../limiter'

export class RedisStore implements BiteLimiterStore {
	private redisEndpoint: string // Base URL of your Redis API

	constructor(redisEndpoint: string) {
		this.redisEndpoint = redisEndpoint
	}

	private async fetchRedisAPI(
		path: string,
		options?: RequestInit
	): Promise<Response> {
		const response = await fetch(`${this.redisEndpoint}${path}`, options)
		if (!response.ok) {
			throw new Error(`Error from Redis API: ${response.statusText}`)
		}
		return response
	}

	public async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now()
		const score = now
		const member = now // Use the timestamp as the member for uniqueness
		const startWindowScore = now - windowMs

		// Add the current timestamp to the sorted set
		await this.fetchRedisAPI(
			`/zadd?key=${encodeURIComponent(key)}&score=${score}&member=${member}`,
			{
				method: 'POST'
			}
		)

		// Remove members outside the current window
		await this.fetchRedisAPI(
			`/zremrangebyscore?key=${encodeURIComponent(
				key
			)}&min=0&max=${startWindowScore}`,
			{
				method: 'POST'
			}
		)

		// Count the number of requests in the current window
		const countResponse = await this.fetchRedisAPI(
			`/zcount?key=${encodeURIComponent(
				key
			)}&min=${startWindowScore}&max=${now}`,
			{
				method: 'GET'
			}
		)
		const count = Number.parseInt(await countResponse.text(), 10)

		return count
	}

	public async reset(key: string): Promise<void> {
		await this.fetchRedisAPI(`/del?key=${encodeURIComponent(key)}`, {
			method: 'POST'
		})
	}
}

export default RedisStore
