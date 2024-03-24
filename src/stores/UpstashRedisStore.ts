import type { BiteLimiterStore } from '../limiter'

export class UpstashRedisStore implements BiteLimiterStore {
	private url: string
	private token: string

	constructor(settings: { url: string; token: string }) {
		this.url = settings.url.replace(/\/$/, '')
		this.token = settings.token
	}

	private async fetchRedisAPI(
		path: string,
		method: 'GET' | 'POST' = 'POST',
		body?: string
	): Promise<Response> {
		const headers = {
			'Content-Type': 'text/plain',
			Authorization: `Bearer ${this.token}`
		}

		const response = await fetch(`${this.url}${path}`, {
			method,
			headers,
			...(body ? { body } : {})
		})

		if (!response.ok) {
			throw new Error(`Error from Upstash Redis: ${response.statusText}`)
		}
		return response.json()
	}

	public async increment(key: string, windowMs: number): Promise<number> {
		const now = Date.now()
		const member = now.toString() // Use the timestamp as the member for uniqueness
		const startWindowScore = (now - windowMs).toString()

		// Add the current timestamp to the sorted set
		await this.fetchRedisAPI(
			`/zadd/${encodeURIComponent(key)}/${member}/${member}`
		)

		// Remove members outside the current window
		await this.fetchRedisAPI(
			`/zremrangebyscore/${encodeURIComponent(key)}/0/${startWindowScore}`
		)

		// Count the number of requests in the current window
		const countResult = await this.fetchRedisAPI(
			`/zcount/${encodeURIComponent(key)}/${startWindowScore}/${now}`
		)

		return Number((countResult as any).result)
	}

	public async reset(key: string): Promise<void> {
		await this.fetchRedisAPI(`/del/${encodeURIComponent(key)}`)
	}
}

export default UpstashRedisStore
