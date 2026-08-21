import { LRUCache } from "lru-cache";

import { parseRepositoryPath, resolveApiContext, resolveToken } from "@/utils/contextUtils";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Cradle, OperationContext } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

export interface RepoAccessContext {
	readonly isAccessible: boolean;
}

export class GitHubRepositoryService {
	private readonly accessCache = new LRUCache<string, RepoAccessContext>({
		max: 500,
		ttl: 1000 * 60 * 60,
	});
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public async checkAccess(
		repository: string,
		token = "",
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<RepoAccessContext>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<RepoAccessContext>(async ($) => {
			const scrubbed = scrubRepositoryUrl(repository);
			const repoInfo = parseRepositoryPath(scrubbed);

			if (repoInfo === null) {
				throw new Error("Invalid repository format");
			}

			const { owner, repo } = repoInfo;
			const cacheKey = `${scrubbed}:${effectiveToken}`;
			const cached = this.accessCache.get(cacheKey);
			if (cached !== undefined) {
				return cached;
			}

			const octokit = $(this.deps.gitHubClient.getOctokit(effectiveToken, safeCtx));
			const repoGetRes = await safe.tryAsync(async (): Promise<unknown> => {
				return await octokit.repos.get({ owner, repo });
			});

			if (repoGetRes.ok === false) {
				const err = repoGetRes.error;
				const errorStatus =
					typeof err === "object" && err !== null && "status" in err
						? Number((err as Record<string, unknown>)["status"])
						: undefined;

				if (errorStatus === 404 || errorStatus === 403) {
					throw new Error(`Repository ${owner}/${repo} is not accessible. Check your token or repository spelling.`);
				}
				throw err instanceof Error ? err : new Error(String(err));
			}

			const accessContext: RepoAccessContext = { isAccessible: true };
			this.accessCache.set(cacheKey, accessContext);

			return accessContext;
		});
	}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
		this.accessCache.clear();
	}
}
