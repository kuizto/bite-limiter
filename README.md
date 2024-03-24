# Bite Limiter

**⚠️ Work in progress, not published yet ⚠️**

Lightweight rate limiting for Web APIs — compatible with Node.js, Cloudflare Workers, browsers, etc...

## Why?

- Existing rate limiting solutions often lead to vendor lock-in or are limited to Node.js runtimes.
- We wanted a simple and agnostic rate limiter, usable with Web API runtimes.
- Implementing rate limiting should be uncomplicated, so devs can protect their apps with minimal setup.
- Built for [kuizto.co](https://kuizto.co/?utm_source=bite-limiter&utm_medium=github), designed for our stack, including Cloudflare Workers, SvelteKit, and Hono.

## Installation

**⚠️ Work in progress, not published yet ⚠️**

```bash
pnpm add @kuizto/bite-limiter
```

## Usage

```ts
import { BiteLimiter } from '@kuizto/bite-limiter'

const ratelimiter = new BiteLimiter({
  prefix: 'user', // Storage key prefix
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit to 100 requests per `window` (here, per 15 minutes).
  // store: ... , // Durable Objects, Workers KV, etc. See below.
})

const { ok, remaining } = await ratelimiter.check(userId)

if (!ok) {
  throw new Error('rate limited')
}
```

## Store

| Status | Name | Description | Environment |
| --- | :--- | :--- | --- |
| ⚠️ | `RedisStore` | Use Redis immediate consistency for rate limiting via REST API, suitable for all distributed environments (Upstash Redis compatible). | All |
| ⚠️ | `DatabaseStore` | Use any Database to enforce rate limiting through Hook functions, ideal for distributed systems and adaptable to various databases and ORMs. | All |
| ⚠️ | `CloudflareDurableStore`| Use Cloudflare Durable Objects for strong consistency and isolation, ideal for stateful rate limiting at the edge. | CF Workers only |

✅ Ready to use.
⚠️ Work in progress.

## Example: SvelteKit + Redis Store

```ts
// src/lib/rateLimiter.ts
const ratelimiter = new BiteLimiter({ 
  windowMs: 60 * 1000, // 1 minute
  limit: 1000, // Limit to 1,000 req per `window`
  store: new RedisStore('https://redis-endpoint.com')
})

// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/custom')) {
    return new Response('custom response')
  }
  const limit = ratelimiter.check(userId)
  if (!limit.ok) error(429);
  return await resolve(event)
}
```

## Example: Hono + CF Durable Objects Store

```toml
[[durable_objects.bindings]]
class_name = "BiteLimiterDurableObject"
name = "BITE_LIMITER"
```

```ts
// export durable object for binding with env.BITE_LIMITER
export { BiteLimiterDurableObject } from '@kuizto/bite-limiter'

// rate limiter using durable object
const ratelimiter = new BiteLimiter({ 
  limit: 50, // 50 req per sec
  store: new CloudflareDurableStore(env.BITE_LIMITER)
})

// hono middleware
const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {x
  const userId = c.req.param('userId')
  const limit = ratelimiter.check(userId)
  if (!limit.ok) {
    return c.text('too many requests', 429)
  }
  await next()
}

// hono router
app.get("/api/:userId/operation", rateLimitMiddleware, myHandler)
```

## Example: Drizzle SQLite + Database Store

```ts
// schema
export const RateLimiter = sqliteTable('RateLimiter', {
  key: text('key').notNull(),
  timestamp: integer('timestamp').notNull(),
}, (RateLimiter) => ({
  idx_rateLimiterkey: index('idx_rateLimiterkey').on(RateLimiter.key),
  idx_rateLimiter_timestamp: index('idx_rateLimiter_timestamp').on(RateLimiter.timestamp),
}))
```

```ts
// drizzle orm
const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

// rate limiter
const ratelimiter = new BiteLimiter({
  limit: 10, // 10 req per sec
  store: new DatabaseStore({
    async insertTimestamp(key, timestamp) {
      await db.insert(RateLimiter).values({ key, timestamp })
    },
    async deleteTimestampsBefore(oldestValidTimestamp) {
      await db.delete(RateLimiter).where(lt(RateLimiter.timestamp, oldestValidTimestamp))
    },
    async deleteAllTimestampsFor(key) {
     await db.delete(RateLimiter).where(eq(RateLimiter.key, key))
    },
    async countValidTimestamps(key, oldestValidTimestamp) {
      const resp = await db.select({ count: count() })
        .from(RateLimiter)
        .where(and(
          eq(RateLimiter.key, key),
          gte(RateLimiter.timestamp, oldestValidTimestamp)
        ))
      return resp?.[0]?.count || 0
    },
  })
})

// main handler
export async function handler(event) {
  const limit = await ratelimiter.check()

  if (!limit.ok) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limit),
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limit),
  }
}
```

## Contributing

Contributions and pull requests are welcome!

## Credits

[![Kuizto — The Everyday Cooking App](https://prisma-appsync.vercel.app/sponsors/kuizto-banner.png "Kuizto — The Everyday Cooking App")](https://kuizto.co/?utm_source=bite-limiter&utm_medium=github)

Open-sourced under the [MIT license](/LICENSE).
