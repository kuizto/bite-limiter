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
		const counter: any[] = []

		await sleep(1000)
		await worker.fetch('http://example.com')
		counter.push(await (await worker.fetch('http://example.com')).json())

		await sleep(600)
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		counter.push(await (await worker.fetch('http://example.com')).json())

		await sleep(600)
		counter.push(await (await worker.fetch('http://example.com')).json())

		await sleep(600)
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		await worker.fetch('http://example.com')
		counter.push(await (await worker.fetch('http://example.com')).json())
		counter.push(await (await worker.fetch('http://example.com')).json())
		counter.push(await (await worker.fetch('http://example.com')).json())

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
