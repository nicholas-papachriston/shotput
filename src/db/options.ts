/**
 * Options for createDbPlugin(). Pass Redis connection string or username/password;
 * optionally provide a password hash and we verify with Bun.password.verify() before connecting.
 */
export interface DbPluginOptions {
	/** Redis URL (e.g. redis://localhost:6379 or redis://user:pass@host:6379). Used when placeholder has no connection (redis:///get:key). */
	redisUrl?: string;
	/** Redis username. Ignored if redisUrl is set. */
	redisUsername?: string;
	/** Redis password. If redisPasswordHash is set, we verify with Bun.password.verify(password, hash) before connecting. */
	redisPassword?: string;
	/** Stored hash from Bun.password.hash(); we verify redisPassword against this before using the password. */
	redisPasswordHash?: string;
}

function buildRedisUrl(options: DbPluginOptions): string {
	if (options.redisUrl) {
		return options.redisUrl.startsWith("redis")
			? options.redisUrl
			: `redis://${options.redisUrl}`;
	}
	const user = options.redisUsername ?? "";
	const pass = options.redisPassword ?? "";
	const host = "localhost:6379";
	if (user && pass) {
		const encoded = encodeURIComponent(pass);
		return `redis://${encodeURIComponent(user)}:${encoded}@${host}`;
	}
	if (pass) {
		return `redis://:${encodeURIComponent(pass)}@${host}`;
	}
	return `redis://${host}`;
}

/**
 * Resolve Redis URL from options. If redisPasswordHash is set, verifies redisPassword with Bun.password.verify.
 */
export async function resolveRedisUrl(
	options: DbPluginOptions | undefined,
): Promise<string | null> {
	if (
		!options?.redisUrl &&
		options?.redisPassword === undefined &&
		!options?.redisUsername
	) {
		return null;
	}
	if (options?.redisPasswordHash) {
		if (options.redisPassword === undefined) {
			throw new Error(
				"redisPasswordHash requires redisPassword for Bun.password.verify.",
			);
		}
		const ok = await Bun.password.verify(
			options.redisPassword,
			options.redisPasswordHash,
		);
		if (!ok) {
			throw new Error(
				"Redis password verification failed (Bun.password.verify).",
			);
		}
	}
	return buildRedisUrl(options ?? {});
}
