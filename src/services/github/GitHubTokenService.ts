import { TOKEN_CONSTANTS } from "@/domain/constants";
import { TokenErrorType } from "@/domain/types";
import { resolveApiContext } from "@/utils/contextUtils";
import { headerToString, parseHeaderList } from "@/utils/httpUtils";
import { safe } from "@/utils/safe";

import type { Cradle, GitHubTokenInfo, OperationContext, RateLimitData, TokenValidationError } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

const VALID_SCOPES: readonly string[] = ["repo", "public_repo", "metadata=read"];

export class GitHubTokenService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async fetchRateLimit(
		token: string,
		secretId?: string,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<RateLimitData>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return await safeCtx.async<RateLimitData>(async ($) => {
			const octokit = $(this.deps.gitHubClient.getOctokit(token, safeCtx, secretId));
			return $(await this.deps.gitHubRateLimitService.fetchRateLimit(octokit.request.bind(octokit), token, secretId));
		});
	}

	public async validateToken(token: string, ctx?: OperationContext | Api | AbortSignal): Promise<Result<GitHubTokenInfo>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return await safeCtx.async<GitHubTokenInfo>(async ($) => {
			const tokenLowerPrefix = token.substring(0, 12).toLowerCase();
			const hasPrefix = TOKEN_CONSTANTS.PREFIXES.some((p): boolean => {
				return tokenLowerPrefix.startsWith(p.toLowerCase()) === true;
			});
			const hasFormat = TOKEN_CONSTANTS.REGEXP.test(token);

			if (hasPrefix === false || hasFormat === false) {
				const type = hasPrefix === false ? TokenErrorType.INVALID_PREFIX : TokenErrorType.INVALID_FORMAT;
				return this.createTokenInfo({
					validToken: false,
					error: {
						type,
						message: "Invalid token format",
						details: { validPrefixes: [...TOKEN_CONSTANTS.PREFIXES] },
					},
				});
			}

			const octokit = $(this.deps.gitHubClient.getOctokit(token, safeCtx));
			const res = await octokit.request("GET /user");
			const headers = res.headers as Record<string, unknown>;

			const scopes = parseHeaderList(headers, "x-oauth-scopes");
			const perms = parseHeaderList(headers, "x-accepted-github-permissions");
			const expiry = headerToString(headers["github-authentication-token-expiration"]);

			const validDate = expiry !== "" ? new Date(expiry).toISOString() : null;
			const isExpired = validDate !== null && new Date(validDate) < new Date();
			const isFineGrained = token.startsWith("github_pat_") === true;

			let hasScope = true;
			if (isFineGrained === false) {
				if (scopes.length > 0 || perms.length > 0) {
					const hasValidScope = scopes.some((s): boolean => {
						return VALID_SCOPES.includes(s) === true;
					});
					const hasValidPerm = perms.some((p): boolean => {
						return VALID_SCOPES.includes(p) === true || p.startsWith("metadata") === true || p.startsWith("contents") === true;
					});
					hasScope = hasValidScope === true || hasValidPerm === true;
				}
			}

			let resolvedScopes: readonly string[] = scopes;
			if (resolvedScopes.length === 0 && isFineGrained === true) {
				resolvedScopes = ["fine-grained-pat"];
			}

			if (isExpired === true) {
				return this.createTokenInfo({
					validToken: false,
					headers,
					expirationDate: validDate,
					scopes: resolvedScopes,
					perms,
					error: {
						type: TokenErrorType.EXPIRED,
						message: "Expired",
						details: { expirationDate: validDate ?? undefined },
					},
				});
			}

			if (hasScope === false) {
				return this.createTokenInfo({
					validToken: false,
					headers,
					expirationDate: validDate,
					scopes: resolvedScopes,
					perms,
					error: {
						type: TokenErrorType.INSUFFICIENT_SCOPE,
						message: "Lacks scopes",
						details: { currentScopes: scopes, requiredScopes: [...VALID_SCOPES] },
					},
				});
			}

			return this.createTokenInfo({
				validToken: true,
				headers,
				expirationDate: validDate,
				scopes: resolvedScopes,
				perms,
				error: { type: TokenErrorType.NONE, message: "OK", details: {} },
			});
		});
	}

	private createTokenInfo(params: {
		readonly validToken: boolean;
		readonly error: TokenValidationError;
		readonly headers?: Record<string, unknown> | undefined;
		readonly expirationDate?: string | null | undefined;
		readonly scopes?: readonly string[] | undefined;
		readonly perms?: readonly string[] | undefined;
	}): GitHubTokenInfo {
		const headers = params.headers ?? {};
		return {
			validToken: params.validToken,
			currentScopes: params.scopes ?? [],
			acceptedScopes: parseHeaderList(headers, "x-accepted-oauth-scopes"),
			acceptedPermissions: params.perms ?? [],
			expirationDate: params.expirationDate ?? null,
			rateLimit: this.parseRateLimit(headers),
			error: params.error,
		};
	}

	private parseRateLimit(headers: Record<string, unknown>): RateLimitData {
		const getNum = (key: string): number => {
			return Number(headerToString(headers[key]));
		};
		const limit = getNum("x-ratelimit-limit");
		const remaining = getNum("x-ratelimit-remaining");
		const reset = getNum("x-ratelimit-reset");
		const used = getNum("x-ratelimit-used");
		const rawResource = headerToString(headers["x-ratelimit-resource"]);
		const resource = rawResource !== "" ? rawResource : "core";

		return {
			limit: Number.isNaN(limit) === false ? limit : 0,
			remaining: Number.isNaN(remaining) === false ? remaining : 0,
			reset: Number.isNaN(reset) === false ? reset : 0,
			resource,
			used: Number.isNaN(used) === false ? used : 0,
			scopes: parseHeaderList(headers, "x-oauth-scopes"),
			timestamp: Date.now(),
		};
	}
}
