import { requestUrl } from "obsidian";

import { resolveApiContext, resolveToken } from "@/utils/contextUtils";
import { toDataBuffer } from "@/utils/httpUtils";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { Cradle, OperationContext, Release } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

export class GitHubAssetService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async downloadAsset(
		release: Readonly<Release>,
		fileName: string,
		token = "",
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<ArrayBuffer | null>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<ArrayBuffer | null>(async ($) => {
			$.checkpoint();
			const asset = release.assets.find((a: Release["assets"][number]): boolean => {
				return a.name === fileName;
			});

			if (asset === undefined) {
				return null;
			}

			if (effectiveToken !== "") {
				const apiBuffer = $(await this.downloadAssetViaApi(asset.url, effectiveToken, safeCtx));
				if (apiBuffer !== null) {
					return apiBuffer;
				}
			}

			return $(await this.downloadAssetDirect(asset.browser_download_url, safeCtx));
		});
	}

	private async downloadAssetViaApi(
		url: string,
		token: string,
		parentCtx?: Api | AbortSignal,
	): Promise<Result<ArrayBuffer | null>> {
		const safeCtx = safe.from(parentCtx).bind(this);
		return await safeCtx.async<ArrayBuffer | null>(async ($) => {
			$.checkpoint();
			const octokit = $(this.deps.gitHubClient.getOctokit(token, safeCtx));
			const matchResult = /repos\/([^/]+)\/([^/]+)\/releases\/assets\/(\d+)/.exec(url);

			if (matchResult === null) {
				return null;
			}

			const owner = matchResult[1] ?? "";
			const repo = matchResult[2] ?? "";
			const assetId = Number(matchResult[3] ?? "0");

			if (owner === "" || repo === "" || Number.isNaN(assetId) === true || assetId === 0) {
				return null;
			}

			const response = await octokit.request("GET /repos/{owner}/{repo}/releases/assets/{asset_id}", {
				owner,
				repo,
				asset_id: assetId,
				headers: { Accept: "application/octet-stream" },
			});

			$.checkpoint();
			return toDataBuffer(response.data);
		});
	}

	private async downloadAssetDirect(
		url: string,
		parentCtx?: Api | AbortSignal,
	): Promise<Result<ArrayBuffer | null>> {
		const safeCtx = safe.from(parentCtx).bind(this);
		return await safeCtx.async<ArrayBuffer | null>(async ($, defer) => {
			const { signal } = safeCtx.options;
			if (signal?.aborted === true) {
				const reason = signal.reason as unknown;
				throw reason instanceof Error ? reason : new Error("Request aborted");
			}

			await assertInternetConnection();

			let abortHandler: (() => void) | undefined;
			defer((): void => {
				if (signal !== undefined && signal !== null && abortHandler !== undefined) {
					signal.removeEventListener("abort", abortHandler);
				}
			});

			const abortPromise = new Promise<never>((_, reject): void => {
				if (signal !== undefined && signal !== null) {
					abortHandler = (): void => {
						const reason = signal.reason as unknown;
						reject(reason instanceof Error ? reason : new Error("Request aborted"));
					};
					signal.addEventListener("abort", abortHandler, { once: true });
				}
			});

			const fetchPromise = requestUrl({ url, headers: { Accept: "application/octet-stream" }, throw: false });
			const response =
				signal !== undefined && signal !== null
					? await Promise.race([fetchPromise, abortPromise])
					: await fetchPromise;

			$.checkpoint();

			if (response.status === 200) {
				return response.arrayBuffer;
			}

			if (response.status === 404) {
				return null;
			}

			throw new Error(`Failed to download asset from ${url}: status code ${String(response.status)}`);
		});
	}
}
