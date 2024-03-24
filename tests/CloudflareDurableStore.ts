/// <reference types="@cloudflare/workers-types" />
import type { ExecutionContext } from '@cloudflare/workers-types/experimental'
import { BiteLimiter, CloudflareDurableStore } from '../src/'

// Need to export all Durable Objects so the runtime can find it
export { BiteLimiterDurableObject } from '../src/'

interface Env {
	BITE_LIMITER: DurableObjectNamespace
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const ratelimiter = new BiteLimiter({
			limit: 10, // 10 req per sec
			store: new CloudflareDurableStore(env.BITE_LIMITER)
		})

		const limit = await ratelimiter.check()

		if (!limit.ok) {
			return Response.json(limit, { status: 429 })
		}

		return Response.json(limit)
	}
}
