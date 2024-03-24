import { describe, expect, it, beforeAll } from 'vitest'
import { BiteLimiter, UpstashRedisStore } from '../src/'

describe('BiteLimiter + UpstashRedisStore', () => {
	let limiter: BiteLimiter

	beforeAll(async () => {
		limiter = new BiteLimiter({
			windowMs: 2 * 1000,
			limit: 10, // 10 req every 2 sec
			store: new UpstashRedisStore({
				url: String(process.env.REDIS_ENDPOINT),
				token: String(process.env.REDIS_TOKEN)
			})
		})
	})

	it('should allow requests under the rate limit', async () => {
		for (let i = 0; i < 9; i++) {
			await limiter.check()
		}
		await sleep(250) // network latency
		const limit = await limiter.check()
		expect(limit).toStrictEqual({ ok: true, remaining: 0 })
	})

	it('should block a request over the rate limit', async () => {
		await sleep(250) // network latency
		const limit = await limiter.check()
		expect(limit).toStrictEqual({ ok: false, remaining: 0 })
	})

	it('should allow requests based on sliding window', async () => {
		// Wait for more than the window size to ensure a reset
		await sleep(2250)

		// Perform two checks and expect the limit to be reached after the second
		await limiter.check()
		let result = await limiter.check()
		expect(result).toStrictEqual({ ok: true, remaining: 8 })

		// Wait for the window to slide
		await sleep(1000)
		await limiter.check()
		await limiter.check()
		result = await limiter.check()
		expect(result).toStrictEqual({ ok: true, remaining: 5 })

		// Wait for the window to slide
		await sleep(1000)
		result = await limiter.check()
		expect(result).toStrictEqual({ ok: true, remaining: 6 })

		// Add more checks to hit the limit
		for (let i = 0; i < 5; i++) {
			await limiter.check()
		}
		result = await limiter.check()
		expect(result).toStrictEqual({ ok: true, remaining: 0 })

		// The next check should be rate limited
		result = await limiter.check()
		expect(result).toStrictEqual({ ok: false, remaining: 0 })
	})
})

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
