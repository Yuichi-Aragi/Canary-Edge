import * as v from "valibot";

import { GitHubRateLimitResponseSchema } from "@/domain/schemas";
import { normalizeHeaders, parseHeaderList } from "@/utils/httpUtils";
import { safe } from "@/utils/safe";

import type { Cradle, RateLimitData } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class GitHubRateLimitService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async fetchRateLimit(
		octokitRequest: (route: string) => Promise<unknown>,
		token: string,
		secretId?: string,
	): Promise<Result<RateLimitData>> {
		return this.safeCtx.async<RateLimitData>(async (_$) => {
			const tokenKey = token !== "" ? token : "anonymous";
			const response = await octokitRequest("GET /rate_limit");

			const parsedRes = v.parse(GitHubRateLimitResponseSchema, response);

			const { data, headers } = parsedRes;
			const normalizedRes = normalizeHeaders(headers);

			const coreData = data.resources?.core ?? data.rate;
			if (coreData === undefined) {
				throw new Error("GitHub rate limit response missing REST resource quota information.");
			}

			let scopes = parseHeaderList(normalizedRes, "x-oauth-scopes");
			if (scopes.length === 0) {
				const perms = parseHeaderList(normalizedRes, "x-accepted-github-permissions");
				if (perms.length > 0) {
					scopes = perms;
				} else if (token.startsWith("github_pat_")) {
					scopes = ["fine-grained-pat"];
				}
			}

			const dataRecord: RateLimitData = {
				limit: coreData.limit,
				remaining: coreData.remaining,
				reset: coreData.reset,
				used: coreData.used,
				resource: "core",
				scopes,
				timestamp: Date.now(),
			};

			if (secretId !== undefined && secretId.trim() !== "") {
				this.deps.canaryStore.updateRateLimit(secretId.trim(), dataRecord);
			}
			this.deps.canaryStore.updateRateLimit(tokenKey, dataRecord);
			return dataRecord;
		});
	}
}
