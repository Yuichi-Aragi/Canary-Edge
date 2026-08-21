import { Octokit } from "@octokit/rest";
import { requestUrl } from "obsidian";

import { ERROR_MESSAGES, NetworkError } from "@/domain/errorMessages";
import { resolveApiContext } from "@/utils/contextUtils";
import { normalizeHeaders, parseHeaderList } from "@/utils/httpUtils";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import type { Cradle, OperationContext, RateLimitData } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

const NETWORK_REQUEST_TIMEOUT = 15000;

function resolveSecretId(ctx?: OperationContext | Api | AbortSignal, fallbackSecretId?: string): string {
	if (fallbackSecretId !== undefined && fallbackSecretId.trim() !== "") {
		return fallbackSecretId.trim();
	}
	if (ctx !== undefined && ctx !== null && "secretId" in ctx && typeof ctx.secretId === "string") {
		return ctx.secretId.trim();
	}
	return "";
}

export class GitHubClient {
	private readonly pendingRequests = new Map<string, Promise<Result<Response, NetworkError>>>();
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public getOctokit(
		token?: string,
		ctx?: OperationContext | Api | AbortSignal,
		secretId?: string,
	): Result<Octokit> {
		const safeApi = safe.from(resolveApiContext(ctx));
		const effectiveSecretId = resolveSecretId(ctx, secretId);

		return safeApi.bind(this)((): Octokit => {
			let extractedSignal: AbortSignal | undefined;
			if (ctx instanceof AbortSignal) {
				extractedSignal = ctx;
			} else if (ctx !== undefined && ctx !== null && "signal" in ctx && ctx.signal instanceof AbortSignal) {
				extractedSignal = ctx.signal;
			} else if (ctx !== undefined && ctx !== null && "options" in ctx && ctx.options.signal instanceof AbortSignal) {
				extractedSignal = ctx.options.signal;
			}

			return new Octokit({
				auth: typeof token === "string" && token !== "" ? token : undefined,
				userAgent: "Obsidian/Canary-Edge-Plugin",
				request: {
					fetch: async (url: string, options: RequestInit): Promise<Response> => {
						const activeSignal = options.signal ?? extractedSignal;
						const mergedOptions: RequestInit =
							activeSignal !== undefined && activeSignal !== null
								? { ...options, signal: activeSignal }
								: { ...options };
						const resRes = await this.queuedFetch(url, mergedOptions, safeApi, effectiveSecretId);
						if (resRes.ok === false) {
							throw resRes.error;
						}
						return resRes.value;
					},
				},
			});
		});
	}

	private async queuedFetch(
		url: string,
		options: RequestInit,
		parentCtx?: Api,
		secretId?: string,
	): Promise<Result<Response, NetworkError>> {
		const safeCtx = safe.from(parentCtx).bind(this);
		return await safeCtx.async<Response, NetworkError>(async ($, defer) => {
			const { signal } = options;
			if (signal?.aborted === true) {
				const reason = signal.reason as unknown;
				throw reason instanceof Error ? reason : new NetworkError("Request aborted");
			}

			await assertInternetConnection();

			const dedupeKey = this.generateDedupeKey(url, options);
			if (dedupeKey !== null) {
				const pending = this.pendingRequests.get(dedupeKey);
				if (pending !== undefined) {
					return $(await pending).clone();
				}
			}

			defer((): void => {
				if (dedupeKey !== null) {
					this.pendingRequests.delete(dedupeKey);
				}
			});

			const resourceKey = this.extractResourceKey(url);
			const taskPromise = safe.async<Response, NetworkError>(async () => {
				const scheduledRes = await this.deps.concurrencyService.scheduleGitHub<Response, NetworkError>(
					resourceKey,
					async (): Promise<Result<Response, NetworkError>> => {
						if (signal?.aborted === true) {
							const reason = signal.reason as unknown;
							return safe.err(
								reason instanceof NetworkError
									? reason
									: new NetworkError(reason instanceof Error ? reason.message : "Request aborted"),
							);
						}
						return await this.performRequest(url, options, safeCtx, secretId);
					},
					{ signal: signal ?? undefined },
				);

				if (scheduledRes.ok === false) {
					const err = scheduledRes.error;
					throw err instanceof NetworkError ? err : new NetworkError(err instanceof Error ? err.message : String(err));
				}

				return scheduledRes.value;
			});

			if (dedupeKey !== null) {
				this.pendingRequests.set(dedupeKey, taskPromise);
			}

			if (signal !== undefined && signal !== null) {
				let abortHandler: (() => void) | undefined;
				const abortPromise = new Promise<never>((_, reject): void => {
					abortHandler = (): void => {
						const reason = signal.reason as unknown;
						reject(
							reason instanceof NetworkError
								? reason
								: new NetworkError(reason instanceof Error ? reason.message : "Request aborted"),
						);
					};
					signal.addEventListener("abort", abortHandler, { once: true });
				});

				defer((): void => {
					if (abortHandler !== undefined) {
						signal.removeEventListener("abort", abortHandler);
					}
				});

				const raceResult = await Promise.race([taskPromise, abortPromise]);
				const res = $(raceResult);
				return res.clone();
			}

			return $(await taskPromise).clone();
		});
	}

	private async performRequest(
		url: string,
		options: RequestInit,
		parentCtx?: Api,
		secretId?: string,
	): Promise<Result<Response, NetworkError>> {
		const safeCtx = safe.from(parentCtx).bind(this);
		return await safeCtx.async<Response, NetworkError>(async ($, defer) => {
			const effectiveSignal = options.signal ?? safeCtx.options.signal;
			if (effectiveSignal?.aborted === true) {
				const reason = effectiveSignal.reason as unknown;
				throw reason instanceof Error ? reason : new NetworkError("Request aborted");
			}

			await assertInternetConnection();

			const reqHeaders = normalizeHeaders(options.headers);
			const method = (options.method ?? "GET").toUpperCase();
			const tokenHeader = reqHeaders["authorization"] ?? "";
			const token = tokenHeader.replace(/^Bearer\s+/i, "").replace(/^token\s+/i, "").trim();

			const shouldCache = $(this.deps.gitHubCacheService.isCacheable(method, url));
			const cacheKey = $(this.deps.gitHubCacheService.generateKey(method, url, token));

			let cachedEntry: { etag: string; body: ArrayBuffer; headers: Record<string, string> } | undefined;
			if (shouldCache === true) {
				cachedEntry = $(this.deps.gitHubCacheService.get(cacheKey));
				if (cachedEntry !== undefined && cachedEntry.etag !== "") {
					reqHeaders["if-none-match"] = cachedEntry.etag;
				}
			}

			const requestOptions: RequestUrlParam = {
				url,
				method,
				headers: reqHeaders,
				throw: false,
			};

			if (typeof options.body === "string") {
				requestOptions.body = options.body;
			}

			let timeoutId: number | undefined;
			let abortHandler: (() => void) | undefined;

			defer((): void => {
				if (timeoutId !== undefined) {
					window.clearTimeout(timeoutId);
				}
				if (abortHandler !== undefined && effectiveSignal !== undefined && effectiveSignal !== null) {
					effectiveSignal.removeEventListener("abort", abortHandler);
				}
			});

			const abortPromise = new Promise<never>((_, reject): void => {
				if (effectiveSignal !== undefined && effectiveSignal !== null) {
					abortHandler = (): void => {
						const reason = effectiveSignal.reason as unknown;
						reject(
							reason instanceof NetworkError
								? reason
								: new NetworkError(reason instanceof Error ? reason.message : "Request aborted"),
						);
					};
					effectiveSignal.addEventListener("abort", abortHandler, { once: true });
				}
			});

			const timeoutPromise = new Promise<never>((_, reject): void => {
				timeoutId = window.setTimeout((): void => {
					reject(new NetworkError(ERROR_MESSAGES.TIMEOUT));
				}, NETWORK_REQUEST_TIMEOUT);
			});

			const response: RequestUrlResponse = await Promise.race([
				requestUrl(requestOptions),
				timeoutPromise,
				abortPromise,
			]);

			$.checkpoint();

			this.interceptRateLimitHeaders(response.headers, token, secretId);

			const isSuccess = response.status >= 200 && response.status < 300;
			const isNotModified = response.status === 304;

			if (isSuccess === false && isNotModified === false) {
				let responseDetails = "";
				const rawText = typeof response.text === "string" ? response.text.trim() : "";
				if (rawText !== "") {
					const parseRes = safe.try((): unknown => {
						return JSON.parse(rawText);
					});

					if (parseRes.ok === true && typeof parseRes.value === "object" && parseRes.value !== null) {
						const parsedObj = parseRes.value as { readonly message?: unknown };
						if (typeof parsedObj.message === "string" && parsedObj.message.trim() !== "") {
							responseDetails = ` (${parsedObj.message.trim()})`;
						} else {
							responseDetails = ` (${rawText.substring(0, 150).trim()})`;
						}
					} else {
						responseDetails = ` (${rawText.substring(0, 150).trim()})`;
					}
				}

				throw new NetworkError(`Failed to request ${url}: status code ${String(response.status)}${responseDetails}`);
			}

			if (response.status === 304 && shouldCache === true) {
				if (cachedEntry !== undefined) {
					return new Response(cachedEntry.body, {
						status: 200,
						headers: new Headers(cachedEntry.headers),
					});
				}

				console.warn(`GitHubClient: 304 received but cache entry missing for ${url}. Retrying without ETag.`);
				const cleanHeaders = { ...reqHeaders };
				delete cleanHeaders["if-none-match"];

				return $(await this.performRequest(url, { ...options, headers: cleanHeaders }, safeCtx, secretId));
			}

			const responseHeaders = response.headers;
			if (response.status === 200 && shouldCache === true) {
				const etag = responseHeaders["etag"] ?? responseHeaders["ETag"];
				if (typeof etag === "string" && etag !== "") {
					$(
						this.deps.gitHubCacheService.set(cacheKey, {
							etag,
							body: response.arrayBuffer,
							headers: responseHeaders,
							status: 200,
							timestamp: Date.now(),
						}),
					);
				}
			}

			const safeStatus = response.status >= 200 && response.status < 600 ? response.status : 500;
			return new Response(response.arrayBuffer, {
				status: safeStatus,
				headers: new Headers(responseHeaders),
			});
		});
	}

	private interceptRateLimitHeaders(
		headers: Record<string, unknown> | undefined,
		token: string,
		secretId?: string,
	): void {
		if (headers === undefined) {
			return;
		}

		const norm = normalizeHeaders(headers);
		const limitStr = norm["x-ratelimit-limit"];
		const remainingStr = norm["x-ratelimit-remaining"];
		const resetStr = norm["x-ratelimit-reset"];

		if (limitStr === undefined || remainingStr === undefined || resetStr === undefined) {
			return;
		}

		const limit = Number(limitStr);
		const remaining = Number(remainingStr);
		const reset = Number(resetStr);
		const usedStr = norm["x-ratelimit-used"];
		const used = usedStr !== undefined ? Number(usedStr) : Math.max(0, limit - remaining);
		const resource = norm["x-ratelimit-resource"] ?? "core";

		if (Number.isNaN(limit) === true || Number.isNaN(remaining) === true || Number.isNaN(reset) === true) {
			return;
		}

		let scopes = parseHeaderList(norm, "x-oauth-scopes");
		if (scopes.length === 0) {
			const perms = parseHeaderList(norm, "x-accepted-github-permissions");
			if (perms.length > 0) {
				scopes = perms;
			} else if (token.startsWith("github_pat_") === true) {
				scopes = ["fine-grained-pat"];
			}
		}

		const rateLimitData: RateLimitData = {
			limit,
			remaining,
			reset,
			used: Number.isNaN(used) === true ? Math.max(0, limit - remaining) : used,
			resource,
			scopes,
			timestamp: Date.now(),
		};

		if (secretId !== undefined && secretId.trim() !== "") {
			this.deps.canaryStore.updateRateLimit(secretId.trim(), rateLimitData);
		}

		if (token !== "") {
			this.deps.canaryStore.updateRateLimit(token, rateLimitData);
		} else {
			this.deps.canaryStore.updateRateLimit("anonymous", rateLimitData);
		}
	}

	private extractResourceKey(url: string): string {
		const match = /repos\/([^/]+\/[^/]+)/.exec(url);
		return match?.[1] ?? "global_github";
	}

	private generateDedupeKey(url: string, options: RequestInit): string | null {
		const method = (options.method ?? "GET").toUpperCase();
		if (method !== "GET") {
			return null;
		}
		const reqHeaders = normalizeHeaders(options.headers);
		const token = reqHeaders["authorization"] ?? "";
		return `GET:${url}:${token}`;
	}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
		this.pendingRequests.clear();
	}
}
