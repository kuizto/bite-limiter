/// <reference types="@cloudflare/workers-types" />
import type { BiteLimiterStore } from '../limiter'

export class CloudflareDurableStore implements BiteLimiterStore {
	private namespace: DurableObjectNamespace

	constructor(namespace: DurableObjectNamespace) {
		this.namespace = namespace
	}

	private async fetchDurableObject(
		key: string,
		action: 'increment' | 'reset',
		windowMs?: number
	) {
		const id = this.namespace.idFromName(key)
		const stub = this.namespace.get(id)
		const url = new URL(`http://example.com/${action}/${windowMs}`)
		const resp = await stub.fetch(url.toString())
		if (!resp.ok) {
			throw new Error(`Error from Durable Object: ${resp.statusText}`)
		}
		return resp
	}

	public async increment(key: string, windowMs: number): Promise<number> {
		const resp = await this.fetchDurableObject(key, 'increment', windowMs)
		const count = await resp.text()
		return Number.parseInt(count, 10)
	}

	public async reset(key: string): Promise<void> {
		await this.fetchDurableObject(key, 'reset')
	}
}

export class BiteLimiterDurableObject {
	private state: DurableObjectState

	constructor(state: DurableObjectState, env: any) {
		this.state = state
	}

	async fetch(request: Request) {
		const url = new URL(request.url)
		const pathname = url.pathname
		const [_, action, windowMs] = pathname.split('/')
		switch (action) {
			case 'increment':
				return this.increment(Number.parseInt(windowMs, 10))
			case 'reset':
				return this.reset()
			default:
				return new Response('Not found', { status: 404 })
		}
	}

	private async cleanup(windowMs: number) {
		const timestamps: number[] =
			(await this.state.storage.get<number[]>('timestamps')) || []
		const now = Date.now()
		const validTimestamps = timestamps.filter(
			(timestamp) => now - timestamp < windowMs
		)
		await this.state.storage.put('timestamps', validTimestamps)
	}

	private async increment(windowMs: number) {
		await this.cleanup(windowMs)
		const timestamps: number[] =
			(await this.state.storage.get<number[]>('timestamps')) || []
		const now = Date.now()
		timestamps.push(now)
		await this.state.storage.put('timestamps', timestamps)
		return new Response(String(timestamps.length))
	}

	private async reset() {
		await this.state.storage.delete('counter')
		return new Response('OK')
	}
}

export default CloudflareDurableStore
