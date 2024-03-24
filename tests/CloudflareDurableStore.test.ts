/// <reference types="@cloudflare/workers-types" />
import { unstable_dev, type UnstableDevWorker } from 'wrangler'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'

describe('BiteLimiter + CloudflareDurableStore', () => {
	let worker: UnstableDevWorker

	beforeAll(async () => {
		worker = await unstable_dev(join(__dirname, 'CloudflareDurableStore.ts'), {
			experimental: { disableExperimentalWarning: true },
			durableObjects: [
				{ name: 'BITE_LIMITER', class_name: 'BiteLimiterDurableObject' }
			]
		})
	})

	afterAll(async () => {
		await worker?.stop()
	})

	it('should allow requests under the rate limit', async () => {
		for (let i = 0; i < 9; i++) {
			await worker.fetch('http://example.com')
		}
		const resp = await worker.fetch('http://example.com')
		const limit = await resp.json()
		expect(limit).toStrictEqual({ ok: true, remaining: 0 })
		expect(resp.status).not.toBe(429)
	})

	it('should block a request over the rate limit', async () => {
		const resp = await worker.fetch('http://example.com')
		const limit = await resp.json()
		expect(limit).toStrictEqual({ ok: false, remaining: 0 })
		expect(resp.status).toBe(429)
	})

	it('should allow requests based on sliding window', async () => {
		// Wait for more than the window size to ensure a reset
		await sleep(1250)

		// Perform two checks and expect the limit to be reached after the second
		await worker.fetch('http://example.com')
		let result = await (await worker.fetch('http://example.com')).json()
		expect(result).toStrictEqual({ ok: true, remaining: 8 })

		// Wait for the window to slide
		await sleep(500)
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		result = await (await worker.fetch('http://example.com')).json()
		expect(result).toStrictEqual({ ok: true, remaining: 5 })

		// Wait for the window to slide
		await sleep(500)
		result = await (await worker.fetch('http://example.com')).json()
		expect(result).toStrictEqual({ ok: true, remaining: 6 })

		// Add more checks to hit the limit
		for (let i = 0; i < 5; i++) {
			await worker.fetch('http://example.com')
		}
		result = await (await worker.fetch('http://example.com')).json()
		expect(result).toStrictEqual({ ok: true, remaining: 0 })

		// The next check should be rate limited
		result = await (await worker.fetch('http://example.com')).json()
		expect(result).toStrictEqual({ ok: false, remaining: 0 })
	})
})

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
