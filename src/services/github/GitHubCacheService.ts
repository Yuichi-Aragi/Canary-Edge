import { LRUCache } from "lru-cache";

import { safe } from "@/utils/safe";

import type { Result } from "@/utils/safe";

interface CacheEntry {
	readonly etag: string;
	readonly body: ArrayBuffer;
	readonly headers: Record<string, string>;
	readonly status: number;
	readonly timestamp: number;
}

export class GitHubCacheService {
	private readonly safeCtx = safe.bind(this);
	private readonly cache = new LRUCache<string, CacheEntry>({
		max: 200,
		maxSize: 50 * 1024 * 1024,
		sizeCalculation: (entry: CacheEntry): number => {
			return entry.body.byteLength;
		},
		ttl: 1000 * 60 * 60 * 24,
	});
	private disposed = false;

	public get(key: string): Result<CacheEntry | undefined> {
		return this.safeCtx((): CacheEntry | undefined => {
			return this.cache.get(key);
		});
	}

	public set(key: string, entry: Readonly<CacheEntry>): Result<undefined> {
		return this.safeCtx((): undefined => {
			this.cache.set(key, entry);
			return undefined;
		});
	}

	public generateKey(method: string, url: string, token: string): Result<string> {
		return this.safeCtx((): string => {
			const tokenHash = token !== "" ? `token:${token.substring(0, 8)}...` : "anonymous";
			return `${method.toUpperCase()}:${url}:${tokenHash}`;
		});
	}

	public isCacheable(method: string, url: string): Result<boolean> {
		return this.safeCtx((): boolean => {
			const isGet = method.toUpperCase() === "GET";
			const isRateLimit = url.includes("/rate_limit") === true;
			const isUser = url.includes("/user") === true;
			return isGet === true && isRateLimit === false && isUser === false;
		});
	}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
		this.cache.clear();
	}
}
