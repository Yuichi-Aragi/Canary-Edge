import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { TokenErrorType } from "@/domain/types";
import { createOperationContext } from "@/services/OperationContext";
import { useService } from "@/ui/hooks/useService";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { UseQueryResult } from "@tanstack/react-query";
import type {
	ChangelogPriority,
	GitHubTokenInfo,
	RateLimitData,
	ReleaseChannel,
	ReleaseVersion,
	ValidationContext,
} from "@/domain/types";

export interface UseRemoteManifestOptions {
	readonly repoUrl: string;
	readonly version?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
	readonly tokenSecretId?: string | undefined;
	readonly isEnabled?: boolean | undefined;
}

export interface UsePluginChangelogOptions {
	readonly repoUrl: string;
	readonly version?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
	readonly priority?: ChangelogPriority | undefined;
	readonly tokenSecretId?: string | undefined;
	readonly isEnabled?: boolean | undefined;
}

export function useReleaseVersions(
	repoUrl: string,
	tokenSecretId?: string,
	isEnabled = true,
): UseQueryResult<ReleaseVersion[]> {
	const releaseService = useService("gitHubReleaseService");
	const settingsService = useService("settingsService");
	const scrubbedRepo = repoUrl !== "" ? scrubRepositoryUrl(repoUrl) : "";

	return useQuery({
		queryKey: ["versions", scrubbedRepo, tokenSecretId],
		queryFn: async (): Promise<ReleaseVersion[]> => {
			if (scrubbedRepo === "") {
				return [];
			}

			await assertInternetConnection();

			const effectiveToken = safe.unwrapOr(settingsService.getEffectiveToken(tokenSecretId), "");
			const versionsList = safe.unwrap(
				await releaseService.fetchReleaseVersions(scrubbedRepo, { token: effectiveToken }),
			);

			if (versionsList === null || versionsList.length === 0) {
				throw new Error("No releases found");
			}

			return versionsList;
		},
		enabled: scrubbedRepo !== "" && isEnabled,
		placeholderData: keepPreviousData,
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 10,
		retry: 0,
	});
}

export function useRemoteManifest(
	options: Readonly<UseRemoteManifestOptions>,
): UseQueryResult<ValidationContext | null> {
	const repoUrl = options.repoUrl;
	const version = options.version !== undefined && options.version !== "" ? options.version : "latest";
	const channel = options.channel ?? "stable";
	const tokenSecretId = options.tokenSecretId;
	const isEnabled = options.isEnabled ?? true;

	const repositoryService = useService("repositoryService");
	const settingsService = useService("settingsService");
	const scrubbedRepo = repoUrl !== "" ? scrubRepositoryUrl(repoUrl) : "";
	const targetVersion = version !== "" ? version : "latest";

	return useQuery({
		queryKey: ["remoteManifest", scrubbedRepo, targetVersion, channel, tokenSecretId],
		queryFn: async (): Promise<ValidationContext | null> => {
			if (scrubbedRepo === "") {
				return null;
			}

			await assertInternetConnection();

			const effectiveToken = safe.unwrapOr(settingsService.getEffectiveToken(tokenSecretId), "");
			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "check",
				token: effectiveToken,
				secretId: tokenSecretId,
			});

			const contextRes = await repositoryService.validateAndFetchManifest(
				ctx,
				targetVersion,
				channel,
			);

			if (!contextRes.ok) {
				throw contextRes.error;
			}

			return contextRes.value;
		},
		enabled: scrubbedRepo !== "" && isEnabled,
		placeholderData: keepPreviousData,
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 10,
		retry: 0,
	});
}

export function usePluginChangelog(
	options: Readonly<UsePluginChangelogOptions>,
): UseQueryResult<string> {
	const repoUrl = options.repoUrl;
	const version = options.version !== undefined && options.version !== "" ? options.version : "latest";
	const channel = options.channel ?? "stable";
	const priority = options.priority ?? "release_notes";
	const tokenSecretId = options.tokenSecretId;
	const isEnabled = options.isEnabled ?? true;

	const changelogService = useService("pluginChangelogService");
	const settingsService = useService("settingsService");
	const scrubbedRepo = repoUrl !== "" ? scrubRepositoryUrl(repoUrl) : "";
	const targetVersion = version !== "" ? version : "latest";

	return useQuery({
		queryKey: ["changelog", scrubbedRepo, targetVersion, channel, priority, tokenSecretId],
		queryFn: async (): Promise<string> => {
			if (scrubbedRepo === "") {
				return "";
			}

			await assertInternetConnection();

			const effectiveToken = safe.unwrapOr(settingsService.getEffectiveToken(tokenSecretId), "");
			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "check",
				token: effectiveToken,
				secretId: tokenSecretId,
			});

			const changelog = await changelogService.fetchChangelogWithFallback(ctx, {
				version: targetVersion,
				releaseChannel: channel,
				priority,
			});

			return changelog;
		},
		enabled: scrubbedRepo !== "" && isEnabled,
		placeholderData: keepPreviousData,
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 10,
		retry: 0,
	});
}

export function useValidateToken(
	secretId: string,
	isEnabled = true,
): UseQueryResult<GitHubTokenInfo | null> {
	const tokenService = useService("gitHubTokenService");
	const settingsService = useService("settingsService");

	return useQuery({
		queryKey: ["validateToken", secretId],
		queryFn: async (): Promise<GitHubTokenInfo | null> => {
			if (secretId === "") {
				return null;
			}

			const token = safe.unwrapOr(settingsService.getToken(secretId), "");
			if (token === "") {
				return {
					validToken: false,
					currentScopes: [],
					acceptedScopes: [],
					acceptedPermissions: [],
					expirationDate: null,
					rateLimit: { limit: 0, remaining: 0, reset: 0, resource: "", used: 0 },
					error: {
						type: TokenErrorType.UNKNOWN,
						message: "Secret invalid",
						details: {},
					},
				};
			}

			await assertInternetConnection();

			const info = safe.unwrap(await tokenService.validateToken(token));
			return info;
		},
		enabled: secretId !== "" && isEnabled,
		staleTime: 1000 * 60 * 60,
		gcTime: 1000 * 60 * 120,
		retry: 0,
	});
}

export function useRateLimit(tokenSecretId?: string): UseQueryResult<RateLimitData> {
	const tokenService = useService("gitHubTokenService");
	const settingsService = useService("settingsService");

	const secretKey = typeof tokenSecretId === "string" && tokenSecretId.trim() !== "" ? tokenSecretId.trim() : "";
	const tokenString = safe.unwrapOr(settingsService.getToken(secretKey), "");

	let queryKeyIdentifier = "anonymous";
	if (secretKey !== "") {
		queryKeyIdentifier = secretKey;
	} else if (tokenString !== "") {
		queryKeyIdentifier = tokenString;
	}

	return useQuery({
		queryKey: ["rateLimit", queryKeyIdentifier],
		queryFn: async (): Promise<RateLimitData> => {
			await assertInternetConnection();

			const rateData = safe.unwrap(await tokenService.fetchRateLimit(tokenString, secretKey));
			return rateData;
		},
		staleTime: 1000 * 60,
		gcTime: 1000 * 60 * 5,
		retry: 0,
		refetchInterval: false,
		refetchOnWindowFocus: false,
	});
}
