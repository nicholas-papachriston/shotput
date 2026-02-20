import type { ShotputConfig } from "../config";
import type { SourceContext, SourcePlugin, SourceResolution } from "../plugins";
import type { DbPluginOptions } from "./options";
import { resolveRedis } from "./redis";
import { resolveSqlite } from "./sqlite";

const SQLITE_PREFIX = "sqlite://";
const REDIS_PREFIX = "redis://";

const DEFAULT_ESTIMATE_LENGTH = 1024;

/**
 * Create the db SourcePlugin: resolves {{sqlite://path/query:SQL}} and
 * {{redis:///get:key}} / {{redis://host/get:key}} / {{redis:///keys:pattern}}.
 * Pass options to supply Redis connection when the placeholder has no host (redis:///get:key):
 * redisUrl, or redisUsername/redisPassword. If redisPasswordHash is set, the password is
 * verified with Bun.password.verify(password, hash) before connecting.
 */
export function createDbPlugin(options?: DbPluginOptions): SourcePlugin {
	return {
		name: "db",
		// true so content is inlined; sync shotput() does not substitute literal placeholders
		canContainTemplates: true,
		matches: (rawPath: string) =>
			rawPath.startsWith(SQLITE_PREFIX) || rawPath.startsWith(REDIS_PREFIX),

		async resolve(ctx: SourceContext): Promise<SourceResolution> {
			const { rawPath, basePath, config, remainingLength } = ctx;
			let content: string;
			if (rawPath.startsWith(SQLITE_PREFIX)) {
				content = resolveSqlite(rawPath, basePath, config);
			} else {
				content = await resolveRedis(rawPath, options);
			}
			const usedLength = Math.min(content.length, remainingLength);
			if (content.length > remainingLength) {
				content = content.slice(0, remainingLength);
			}
			return {
				content,
				remainingLength: remainingLength - usedLength,
			};
		},

		estimateLength: async (
			_rawPath: string,
			_config: ShotputConfig,
		): Promise<number> => {
			return DEFAULT_ESTIMATE_LENGTH;
		},
	};
}

export type { DbPluginOptions } from "./options";
export type { SqliteParsed } from "./sqlite";
export type { RedisParsed, RedisOp } from "./redis";
export {
	parseSqliteUrl,
	validateSqlitePath,
	runSqliteQuery,
	resolveSqlite,
} from "./sqlite";
export { parseRedisUrl, resolveRedis } from "./redis";
