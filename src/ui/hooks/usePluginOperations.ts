import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useService } from "@/ui/hooks/useService";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Draft } from "mutative";
import type {
	PluginConfig,
	PluginConfigurationOverrides,
	UpdateOperationResult,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

export interface InstallPluginParams {
	readonly repo: string;
	readonly version: string;
	readonly isFrozen: boolean;
	readonly tokenSecretId?: string | undefined;
	readonly enableAfterInstall: boolean;
	readonly forceReinstall?: boolean | undefined;
	readonly overrides?: PluginConfigurationOverrides | undefined;
}

export interface SavePluginSettingsParams {
	readonly repo: string;
	readonly version: string;
	readonly isFrozen: boolean;
	readonly tokenSecretId?: string | undefined;
	readonly enableAfterInstall: boolean;
	readonly isIncompatible?: boolean | undefined;
	readonly overrides?: PluginConfigurationOverrides | undefined;
}

export interface UpdatePluginParams {
	readonly repo: string;
	readonly frozenTokenSecretId?: string | undefined;
	readonly onlyCheckDontUpdate?: boolean | undefined;
}

export interface RegisterUntrackedParams {
	readonly pluginId: string;
	readonly repoPath?: string | undefined;
}

export interface InvalidateOptions {
	readonly structuralChange?: boolean | undefined;
}

export interface UsePluginOperationsResult {
	readonly installPlugin: UseMutationResult<undefined, Error, InstallPluginParams>;
	readonly savePluginSettings: UseMutationResult<undefined, Error, SavePluginSettingsParams>;
	readonly updatePlugin: UseMutationResult<UpdateOperationResult, Error, UpdatePluginParams>;
	readonly deletePlugin: UseMutationResult<undefined, Error, string>;
	readonly resetPluginSettings: UseMutationResult<undefined, Error, string>;
	readonly registerUntrackedPlugin: UseMutationResult<string, Error, RegisterUntrackedParams>;
	readonly cancelOperation: (repo: string) => Result<undefined>;
}

export function usePluginOperations(): UsePluginOperationsResult {
	const queryClient = useQueryClient();
	const workflowService = useService("pluginWorkflowService");
	const settingsService = useService("settingsService");
	const pluginQueryService = useService("pluginQueryService");
	const canaryStore = useService("canaryStore");

	const invalidatePluginData = useCallback(
		async (repos: string | readonly string[], options?: Readonly<InvalidateOptions>): Promise<void> => {
			const repoList = typeof repos === "string" ? [repos] : repos;
			const uniqueRepos = Array.from(
				new Set(
					repoList.filter((repo: string): boolean => {
						return repo.trim() !== "";
					}),
				),
			);

			if (uniqueRepos.length === 0) {
				return;
			}

			const isStructural = options?.structuralChange ?? false;

			const res = await safe.tryAsync(async (): Promise<void> => {
				const queryPromises: Promise<void>[] = [];

				if (isStructural) {
					queryPromises.push(
						queryClient.invalidateQueries({ queryKey: ["plugins", "installed"], exact: true }),
						queryClient.invalidateQueries({ queryKey: ["trackedPluginMappings"] }),
					);
				}

				for (const repo of uniqueRepos) {
					queryPromises.push(
						queryClient.invalidateQueries({ queryKey: ["manifest", repo], exact: true }),
						queryClient.invalidateQueries({ queryKey: ["versions", repo], exact: true }),
						queryClient.invalidateQueries({ queryKey: ["pluginId", repo], exact: true }),
					);
				}

				await Promise.all(queryPromises);
			});

			if (!res.ok) {
				console.error(
					`[usePluginOperations] Failed to invalidate queries for ${uniqueRepos.join(", ")}:`,
					res.error,
				);
			}
		},
		[queryClient],
	);

	const installPlugin = useMutation<undefined, Error, InstallPluginParams>({
		mutationKey: ["plugin", "install"],
		mutationFn: async (params: Readonly<InstallPluginParams>): Promise<undefined> => {
			await assertInternetConnection();

			safe.unwrap(
				await workflowService.addPlugin({
					repositoryPath: params.repo,
					updatePluginFiles: false,
					seeIfUpdatedOnly: false,
					reportIfNotUpdated: false,
					specifyVersion: params.version,
					forceReinstall: params.forceReinstall === true,
					enableAfterInstall: params.enableAfterInstall,
					privateApiKeySecretId: params.tokenSecretId ?? "",
					isFrozen: params.isFrozen,
					overrides: params.overrides,
				}),
			);
			return undefined;
		},
		onSuccess: async (_data: undefined, params: Readonly<InstallPluginParams>): Promise<void> => {
			canaryStore.updateOperationState(params.repo, null);
			await invalidatePluginData(params.repo, { structuralChange: true });
		},
		retry: 0,
	});

	const savePluginSettings = useMutation<undefined, Error, SavePluginSettingsParams>({
		mutationKey: ["plugin", "saveSettings"],
		mutationFn: async (params: Readonly<SavePluginSettingsParams>): Promise<undefined> => {
			safe.unwrap(
				await workflowService.savePluginSettings({
					repositoryPath: params.repo,
					isFrozen: params.isFrozen,
					privateApiKeySecretId: params.tokenSecretId ?? "",
					enableAfterInstall: params.enableAfterInstall,
					isIncompatible: params.isIncompatible,
					overrides: params.overrides,
				}),
			);
			return undefined;
		},
		onSuccess: async (_data: undefined, params: Readonly<SavePluginSettingsParams>): Promise<void> => {
			await invalidatePluginData(params.repo, { structuralChange: false });
		},
		retry: 0,
	});

	const updatePlugin = useMutation<UpdateOperationResult, Error, UpdatePluginParams>({
		mutationKey: ["plugin", "update"],
		mutationFn: async (params: Readonly<UpdatePluginParams>): Promise<UpdateOperationResult> => {
			await assertInternetConnection();

			return safe.unwrap(
				await workflowService.updatePlugin({
					repositoryPath: params.repo,
					onlyCheckDontUpdate: params.onlyCheckDontUpdate === true,
					reportIfNotUpdated: true,
					forceReinstall: false,
					privateApiKeySecretId: params.frozenTokenSecretId ?? "",
				}),
			);
		},
		onSuccess: async (_data: Readonly<UpdateOperationResult>, params: Readonly<UpdatePluginParams>): Promise<void> => {
			await invalidatePluginData(params.repo, { structuralChange: false });
		},
		retry: 0,
	});

	const deletePlugin = useMutation<undefined, Error, string>({
		mutationKey: ["plugin", "delete"],
		mutationFn: async (repo: string): Promise<undefined> => {
			safe.unwrap(await workflowService.deletePlugin(repo));
			return undefined;
		},
		onSuccess: async (_data: undefined, repo: string): Promise<void> => {
			await invalidatePluginData(repo, { structuralChange: true });
		},
		retry: 0,
	});

	const resetPluginSettings = useMutation<undefined, Error, string>({
		mutationKey: ["plugin", "resetSettings"],
		mutationFn: async (repo: string): Promise<undefined> => {
			const settingsRes = await settingsService.getSettingsQueued();
			const settings = safe.unwrap(settingsRes);

			safe.unwrap(
				await settingsService.updatePluginSettings(
					repo,
					(draft: Draft<PluginConfig>): void => {
						draft.autoEnable = undefined;
						draft.showChangelog = undefined;
						draft.tokenSecretId = undefined;
						draft.updateInterval = undefined;
						draft.releaseChannel = undefined;
						draft.updateCheckOnLoad = undefined;
						draft.forceInstall = undefined;
					},
					settings.version,
				),
			);
			return undefined;
		},
		onSuccess: async (_data: undefined, repo: string): Promise<void> => {
			await invalidatePluginData(repo, { structuralChange: false });
		},
		retry: 0,
	});

	const registerUntrackedPlugin = useMutation<string, Error, RegisterUntrackedParams>({
		mutationKey: ["plugin", "registerUntracked"],
		mutationFn: async (params: Readonly<RegisterUntrackedParams>): Promise<string> => {
			let { repoPath } = params;
			const { pluginId } = params;

			if (repoPath === undefined || repoPath.trim() === "") {
				const repoRes = await pluginQueryService.getRepoByPluginId(pluginId);
				repoPath = safe.unwrapOr(repoRes, undefined);
			}

			if (repoPath === undefined || repoPath.trim() === "" || !repoPath.includes("/")) {
				throw new Error(
					`Unable to resolve official repository for "${pluginId}". Please use the Install panel directly for private or unlisted plugins.`,
				);
			}

			const settingsRes = settingsService.getSettings();
			const currentSettings = safe.unwrap(settingsRes);

			safe.unwrap(
				await settingsService.addPluginToList(
					repoPath,
					{
						isFrozen: false,
						privateApiKeySecretId: "",
						isIncompatible: false,
						overrides: undefined,
						mergeWithExisting: true,
					},
					currentSettings.version,
				),
			);

			return repoPath;
		},
		onSuccess: async (repoPath: string, params: Readonly<RegisterUntrackedParams>): Promise<void> => {
			await invalidatePluginData([repoPath, params.pluginId], { structuralChange: true });
		},
		retry: 0,
	});

	const cancelOperation = useCallback(
		(repo: string): Result<undefined> => {
			return workflowService.cancelOperation(repo);
		},
		[workflowService],
	);

	return {
		installPlugin,
		savePluginSettings,
		updatePlugin,
		deletePlugin,
		resetPluginSettings,
		registerUntrackedPlugin,
		cancelOperation,
	};
}
