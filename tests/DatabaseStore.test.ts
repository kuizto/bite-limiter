import { describe, expect, it, beforeAll } from 'vitest'
import { BiteLimiter, DatabaseStore } from '../src/'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sql, eq, gte, lt, and, count } from 'drizzle-orm'
import Database, {
	type Database as BetterSqlite3Database
} from 'better-sqlite3'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// db
const dbName = 'DatabaseStore.sqlite.db'

// setup sql
const setup = [
	'CREATE TABLE RateLimiter (key TEXT NOT NULL, timestamp INTEGER NOT NULL);',
	'CREATE INDEX idx_rateLimiter_key ON RateLimiter(key);',
	'CREATE INDEX idx_rateLimiter_timestamp ON RateLimiter(timestamp);'
]

// schema
export const RateLimiter = sqliteTable(
	'RateLimiter',
	{
		key: text('key').notNull(),
		timestamp: integer('timestamp').notNull()
	},
	(RateLimiter) => ({
		idx_rateLimiterkey: index('idx_rateLimiterkey').on(RateLimiter.key),
		idx_rateLimiter_timestamp: index('idx_rateLimiter_timestamp').on(
			RateLimiter.timestamp
		)
	})
)

describe('BiteLimiter + DatabaseStore', () => {
	let limiter: BiteLimiter
	let sqlite: BetterSqlite3Database
	let db: ReturnType<typeof drizzle>

	beforeAll(async () => {
		// delete existing db file
		if (existsSync(join(__dirname, dbName))) unlinkSync(join(__dirname, dbName))

		// create new db instance
		sqlite = new Database(join(__dirname, dbName))
		db = drizzle(sqlite)

		for (let idx = 0; idx < setup.length; idx++) {
			const statement = setup[idx]
			await db.run(sql.raw(statement))
		}

		// rate limiter
		limiter = new BiteLimiter({
			limit: 10, // 10 req per sec
			store: new DatabaseStore({
				async insertTimestamp(key, timestamp) {
					await db.insert(RateLimiter).values({ key, timestamp })
				},
				async deleteTimestampsBefore(oldestValidTimestamp) {
					await db
						.delete(RateLimiter)
						.where(lt(RateLimiter.timestamp, oldestValidTimestamp))
				},
				async deleteAllTimestampsFor(key) {
					await db.delete(RateLimiter).where(eq(RateLimiter.key, key))
				},
				async countValidTimestamps(key, oldestValidTimestamp) {
					const resp = await db
						.select({ count: count() })
						.from(RateLimiter)
						.where(
							and(
								eq(RateLimiter.key, key),
								gte(RateLimiter.timestamp, oldestValidTimestamp)
							)
						)
					return resp?.[0]?.count || 0
				}
			})
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
