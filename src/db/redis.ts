import { RedisClient, redis } from "bun";
import type { DbPluginOptions } from "./options";
import { resolveRedisUrl } from "./options";

const REDIS_PREFIX = "redis://";
const GET_PREFIX = "get:";
const KEYS_PREFIX = "keys:";

export type RedisOp =
	| { type: "get"; key: string }
	| { type: "keys"; pattern: string };

export interface RedisParsed {
	/** Empty = use default client (REDIS_URL / VALKEY_URL). Otherwise connection URL. */
	connection: string;
	op: RedisOp;
}

/**
 * Parse redis://[host[:port]]/get:key or redis://[host]/keys:pattern.
 * redis:///get:key uses default client.
 */
export function parseRedisUrl(rawPath: string): RedisParsed | null {
	if (!rawPath.startsWith(REDIS_PREFIX)) return null;
	const after = rawPath.slice(REDIS_PREFIX.length);
	const lastSlash = after.lastIndexOf("/");
	if (lastSlash === -1) return null;
	const connection = after.slice(0, lastSlash).trim();
	const opStr = after.slice(lastSlash + 1).trim();
	if (opStr.startsWith(GET_PREFIX)) {
		const key = opStr.slice(GET_PREFIX.length).trim();
		if (!key) return null;
		return { connection, op: { type: "get", key } };
	}
	if (opStr.startsWith(KEYS_PREFIX)) {
		const pattern = opStr.slice(KEYS_PREFIX.length).trim();
		return { connection, op: { type: "keys", pattern: pattern || "*" } };
	}
	return null;
}

/**
 * Resolve connection to a Redis client. When connection is empty, uses urlFromOptions
 * if provided (from createDbPlugin options); otherwise the default client (REDIS_URL / VALKEY_URL).
 */
async function getClient(
	connection: string,
	urlFromOptions: string | null,
): Promise<typeof redis | RedisClient> {
	if (!connection) {
		if (urlFromOptions) {
			return new RedisClient(urlFromOptions);
		}
		return redis;
	}
	return new RedisClient(`redis://${connection}`);
}

/**
 * Resolve redis:// placeholder: GET key or KEYS pattern, return content string.
 * When connection is empty, options (redisUrl or username/password) are used if provided.
 * If options.redisPasswordHash is set, redisPassword is verified with Bun.password.verify before connecting.
 */
export async function resolveRedis(
	rawPath: string,
	options?: DbPluginOptions,
): Promise<string> {
	const parsed = parseRedisUrl(rawPath);
	if (!parsed) {
		throw new Error(`Invalid redis URL: ${rawPath}`);
	}
	const urlFromOptions =
		!parsed.connection && options ? await resolveRedisUrl(options) : null;
	const client = await getClient(parsed.connection, urlFromOptions);
	const isCustom = !!parsed.connection || !!urlFromOptions;
	try {
		if (parsed.op.type === "get") {
			const value = await client.get(parsed.op.key);
			return value ?? "";
		}
		// keys:pattern — use send for KEYS command (both default redis and RedisClient have send)
		const keys = await client.send("KEYS", [parsed.op.pattern]);
		const arr = Array.isArray(keys) ? keys : [keys];
		return JSON.stringify(arr);
	} finally {
		if (isCustom && client instanceof RedisClient) {
			client.close();
		}
	}
}
