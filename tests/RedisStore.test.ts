import { describe, expect, it, beforeAll } from 'vitest'
import { BiteLimiter, RedisStore } from '../src/'

describe('BiteLimiter + RedisStore', () => {
	let limiter: BiteLimiter

	beforeAll(async () => {
		limiter = new BiteLimiter({
			limit: 10, // 10 req per sec
			store: new RedisStore(String(process.env.REDIS_ENDPOINT))
		})
	})

	it('should allow requests under the rate limit', async () => {
		for (let i = 0; i < 9; i++) {
			await limiter.check()
		}
		const limit = await limiter.check()
		expect(limit).toStrictEqual({ ok: true, remaining: 0 })
	})

	it('should block a request over the rate limit', async () => {
		const limit = await limiter.check()
		expect(limit).toStrictEqual({ ok: false, remaining: 0 })
	})

	it('should allow requests based on sliding window', async () => {
		const counter: any[] = []

		await sleep(1000)
		await limiter.check()
		counter.push(await limiter.check())

		await sleep(600)
		await limiter.check()
		await limiter.check()
		counter.push(await limiter.check())

		await sleep(600)
		counter.push(await limiter.check())

		await sleep(600)
		await limiter.check()
		await limiter.check()
		await limiter.check()
		await limiter.check()
		await limiter.check()
		await limiter.check()
		await limiter.check()
		counter.push(await limiter.check())
		counter.push(await limiter.check())
		counter.push(await limiter.check())

		expect(counter).toStrictEqual([
			{ ok: true, remaining: 8 }, // 10 -2
			{ ok: true, remaining: 5 }, // 8 - 3
			{ ok: true, remaining: 6 }, // 5 - 1 + 2
			{ ok: true, remaining: 1 }, // 6 - 8 + 3
			{ ok: true, remaining: 0 }, // 1 - 1
			{ ok: false, remaining: 0 }
		])
	})
})

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
