import { useCallback, useMemo } from "react";

import { createOperationContext } from "@/services/OperationContext";
import { EMPTY_ARRAY } from "@/store/CanaryStore";
import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useCanaryActions, useCanaryState } from "@/ui/hooks/useCanaryStore";
import { usePluginId } from "@/ui/hooks/usePluginId";
import { usePluginOperations } from "@/ui/hooks/usePluginOperations";
import { useService } from "@/ui/hooks/useService";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { safe } from "@/utils/safe";

import type { InternalApp } from "@/domain/obsidian-internals";
import type {
	DetectedUpdate,
	OperationState,
	PluginConfig,
	UpdateOperationResult,
} from "@/domain/types";
import type { ActiveInstallOperation } from "@/ui/hooks/useMutationTracker";

export interface PluginCardOverrideData {
	readonly name?: string | undefined;
	readonly version?: string | undefined;
	readonly description?: string | undefined;
	readonly author?: string | undefined;
	readonly isIncompatible?: boolean | undefined;
	readonly isLoading?: boolean | undefined;
	readonly isError?: boolean | undefined;
	readonly loadingMessage?: string | undefined;
	readonly errorMessage?: string | undefined;
	readonly onRetry?: (() => void) | undefined;
}

export interface UsePluginCardViewModelParams {
	readonly repo: string;
	readonly frozenData?: PluginConfig | undefined;
	readonly operation?: OperationState | undefined;
	readonly activeInstallation?: ActiveInstallOperation | undefined;
	readonly onDelete?: ((repo: string) => void) | undefined;
	readonly onUpdate?: ((repo: string, tokenSecretId?: string) => void) | undefined;
	readonly onSettings?: ((repo: string, data?: PluginConfig) => void) | undefined;
	readonly onRetryInstall?: ((activeOp: ActiveInstallOperation) => void) | undefined;
	readonly onDiscardInstall?: ((activeOp: ActiveInstallOperation) => void) | undefined;
	readonly onCancelInstall?: ((repo: string) => void) | undefined;
	readonly overrideData?: PluginCardOverrideData | undefined;
}

export interface PluginCardViewState {
	readonly pluginDisplayName: string;
	readonly manifestVersion: string;
	readonly isIncompatible: boolean;
	readonly manifestDescription: string;
	readonly manifestAuthor: string | undefined;
	readonly isBusy: boolean;
	readonly hasActiveOperation: boolean;
	readonly isFrozen: boolean;
	readonly isUntracked: boolean;
	readonly isInstalling: boolean;
	readonly installStatus: "pending" | "error" | "none";
	readonly installErrorMessage: string | undefined;
	readonly detectedUpdates: readonly DetectedUpdate[];
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly loadingMessage: string | undefined;
	readonly errorMessage: string | undefined;
}

export interface PluginCardViewActions {
	readonly handleUpdateClick: (onlyCheck?: boolean) => void;
	readonly handleSettingsClick: () => void;
	readonly handleDeleteClick: () => void;
	readonly handleResetSettings: () => void;
	readonly handleRegisterUntracked: () => void;
	readonly handleClearDetectedUpdates: () => void;
	readonly handleSelectDetectedUpdate: (update: Readonly<DetectedUpdate>) => void;
	readonly handleCancelOperation: () => void;
	readonly handleRetryInstall: () => void;
	readonly handleDiscardInstall: () => void;
	readonly handleRetry: (() => void) | undefined;
}

export interface PluginCardViewModel {
	readonly state: PluginCardViewState;
	readonly actions: PluginCardViewActions;
}

export function usePluginCardViewModel({
	repo,
	frozenData,
	operation,
	activeInstallation,
	onSettings,
	onRetryInstall,
	onDiscardInstall,
	onCancelInstall,
	overrideData,
}: Readonly<UsePluginCardViewModelParams>): PluginCardViewModel {
	const { isPending: isTransitionPending, runTransition } = useTransitionAction();
	const mainPlugin = useService("plugin");
	const settingsService = useService("settingsService");
	const uiService = useService("uiService");
	const pluginChangelogService = useService("pluginChangelogService");
	const pluginQueryService = useService("pluginQueryService");
	const workflowService = useService("pluginWorkflowService");

	const detectedUpdates = useCanaryState((storeState) => {
		return storeState.runtime.detectedUpdates[repo] ?? EMPTY_ARRAY;
	});
	const clearDetectedUpdates = useCanaryActions((storeActions) => {
		return storeActions.clearDetectedUpdates;
	});
	const dismissDetectedUpdate = useCanaryActions((storeActions) => {
		return storeActions.dismissDetectedUpdate;
	});

	const isTracked = useMemo((): boolean => {
		const res = settingsService.existPluginInList(repo);
		return safe.unwrapOr(res, false);
	}, [settingsService, repo]);

	const resolvedId = usePluginId(repo);
	const fallbackRepoName = repo.includes("/") === true ? (repo.split("/")[1] ?? repo) : repo;
	const pluginId = isTracked === true ? (resolvedId ?? fallbackRepoName) : repo;

	const internalApp = mainPlugin.app as InternalApp;
	const { manifests } = internalApp.plugins;
	const manifest = manifests[pluginId];

	const {
		updatePlugin,
		deletePlugin,
		resetPluginSettings,
		registerUntrackedPlugin,
	} = usePluginOperations();

	const isInstalling = activeInstallation !== undefined;
	const installStatus: "pending" | "error" | "none" =
		activeInstallation !== undefined ? activeInstallation.status : "none";
	const installErrorMessage = activeInstallation?.error?.message;

	const pluginDisplayName: string =
		overrideData?.name ?? manifest?.name ?? fallbackRepoName;

	const resolveManifestVersion = (): string => {
		if (overrideData?.version !== undefined && overrideData.version !== "") {
			return overrideData.version;
		}
		if (manifest?.version !== undefined && manifest.version !== "") {
			return manifest.version;
		}
		if (isInstalling === true) {
			const activeVersion = activeInstallation?.version;
			if (activeVersion !== undefined && activeVersion !== "") {
				return activeVersion;
			}
			return "latest";
		}
		return "...";
	};

	const manifestVersion = resolveManifestVersion();

	const resolveManifestDescription = (): string => {
		if (overrideData?.description !== undefined && overrideData.description !== "") {
			return overrideData.description;
		}
		if (manifest?.description !== undefined && manifest.description !== "") {
			return manifest.description;
		}
		if (isInstalling === true) {
			const operationMessage = operation?.message;
			if (operationMessage !== undefined && operationMessage !== "") {
				return operationMessage;
			}
			const installOpErrorMessage = activeInstallation?.error?.message;
			if (installOpErrorMessage !== undefined && installOpErrorMessage !== "") {
				return `Error: ${installOpErrorMessage}`;
			}
			return "Installation queued...";
		}
		return "";
	};

	const manifestDescription = resolveManifestDescription();

	const manifestAuthor: string | undefined = overrideData?.author ?? manifest?.author ?? undefined;
	const isIncompatible = overrideData?.isIncompatible ?? (frozenData?.compatibility === "incompatible");
	const isFrozen = frozenData?.status === "frozen" || (isInstalling === true && (activeInstallation?.variables.isFrozen ?? false));

	const isLocalMutationPending =
		updatePlugin.isPending ||
		deletePlugin.isPending ||
		resetPluginSettings.isPending ||
		registerUntrackedPlugin.isPending;

	const hasActiveOperation =
		isInstalling === true
			? activeInstallation?.status === "pending" || operation?.status === "pending"
			: isTracked === true && operation?.status === "pending";

	const isBusy = hasActiveOperation === true || isLocalMutationPending === true || isTransitionPending === true;

	const isLoading = overrideData?.isLoading ?? false;
	const isError = overrideData?.isError ?? false;
	const loadingMessage = overrideData?.loadingMessage;
	const errorMessage = overrideData?.errorMessage;

	const handleUpdateClick = useCallback(
		(onlyCheck = false): void => {
			runTransition((): void => {
				updatePlugin.mutate(
					{
						repo,
						frozenTokenSecretId: frozenData?.tokenSecretId,
						onlyCheckDontUpdate: onlyCheck,
					},
					{
						onSuccess: (result: Readonly<UpdateOperationResult>): void => {
							if (onlyCheck === true) {
								if (result.status === "update_available" || result.wasUpdated === true) {
									canaryToast.info(`Update available for ${pluginDisplayName}`);
								} else {
									canaryToast.success(`${pluginDisplayName} is up to date`);
								}
							}
						},
						onError: (err: Error): void => {
							canaryToast.error(`Update check failed for ${pluginDisplayName}: ${err.message}`);
						},
					},
				);
			});
		},
		[updatePlugin, repo, frozenData?.tokenSecretId, runTransition, pluginDisplayName],
	);

	const handleSettingsClick = useCallback((): void => {
		if (onSettings === undefined) {
			return;
		}
		onSettings(repo, frozenData);
	}, [onSettings, repo, frozenData]);

	const handleDeleteClick = useCallback((): void => {
		runTransition(async (): Promise<void> => {
			const confirmRes = await uiService.confirmOverride({
				type: "unregister",
				repo,
			});
			if (confirmRes.ok === true && confirmRes.value === true) {
				deletePlugin.mutate(repo, {
					onSuccess: (): void => {
						canaryToast.success(`Unregistered ${pluginDisplayName}`);
					},
					onError: (err: Error): void => {
						canaryToast.error(`Failed to unregister ${pluginDisplayName}: ${err.message}`);
					},
				});
			}
		});
	}, [uiService, repo, deletePlugin, runTransition, pluginDisplayName]);

	const handleResetSettings = useCallback((): void => {
		runTransition(async (): Promise<void> => {
			const confirmRes = await uiService.confirmOverride({
				type: "resetSettings",
				repo,
			});
			if (confirmRes.ok === true && confirmRes.value === true) {
				resetPluginSettings.mutate(repo, {
					onSuccess: (): void => {
						canaryToast.success(`Reset settings for ${pluginDisplayName}`);
					},
					onError: (err: Error): void => {
						canaryToast.error(`Failed to reset settings for ${pluginDisplayName}: ${err.message}`);
					},
				});
			}
		});
	}, [uiService, repo, resetPluginSettings, runTransition, pluginDisplayName]);

	const handleRegisterUntracked = useCallback((): void => {
		runTransition(async (): Promise<void> => {
			const repoRes = await pluginQueryService.getRepoByPluginId(pluginId);
			const resolvedRepo = safe.unwrapOr(repoRes, undefined);

			if (resolvedRepo === undefined || resolvedRepo.trim() === "" || resolvedRepo.includes("/") === false) {
				canaryToast.info(
					`Cannot resolve GitHub repository for "${pluginDisplayName}". For private or community-unlisted plugins, please register using the Install panel directly.`,
					{ duration: 6000, id: `untracked-reg-${pluginId}` },
				);
				return;
			}

			registerUntrackedPlugin.mutate(
				{ pluginId, repoPath: resolvedRepo },
				{
					onSuccess: (repoPath: string): void => {
						canaryToast.success(`Successfully registered and tracked: ${repoPath}`);
					},
					onError: (err: Error): void => {
						canaryToast.error(`Failed to register plugin: ${err.message}`);
					},
				},
			);
		});
	}, [runTransition, pluginQueryService, pluginId, pluginDisplayName, registerUntrackedPlugin]);

	const handleClearDetectedUpdates = useCallback((): void => {
		runTransition((): void => {
			clearDetectedUpdates(repo);
		});
	}, [clearDetectedUpdates, repo, runTransition]);

	const handleSelectDetectedUpdate = useCallback(
		(update: Readonly<DetectedUpdate>): void => {
			runTransition(async (): Promise<void> => {
				const pluginConfig = safe.unwrapOr(settingsService.getPluginConfiguration(repo), null);
				const tokenSecretId =
					pluginConfig?.tokenSecretId !== false && pluginConfig?.tokenSecretId !== undefined
						? pluginConfig.tokenSecretId
						: "";
				const secretId = safe.unwrapOr(settingsService.resolveTokenSecretId(repo, tokenSecretId), "");
				const token = safe.unwrapOr(settingsService.getEffectiveToken(secretId), undefined);
				const releaseChannel = pluginConfig?.releaseChannel ?? "stable";

				const opCtx = createOperationContext({
					repo,
					operationType: "check",
					token,
					secretId,
				});

				const changelog = await pluginChangelogService.fetchChangelogWithFallback(opCtx, {
					version: update.version,
					releaseChannel,
				});

				dismissDetectedUpdate({ repo, id: update.id });

				const displayRes = await uiService.displayChangelog({
					repo,
					version: update.version,
					changelog,
					mode: "after",
				});

				if (displayRes.ok === false) {
					console.error("Failed to display changelog for detected update:", displayRes.error);
				}
			});
		},
		[
			runTransition,
			settingsService,
			repo,
			pluginChangelogService,
			dismissDetectedUpdate,
			uiService,
		],
	);

	const handleCancelOperation = useCallback((): void => {
		runTransition((): void => {
			if (isInstalling === true && onCancelInstall !== undefined) {
				onCancelInstall(repo);
				return;
			}
			const cancelRes = workflowService.cancelOperation(repo);
			if (cancelRes.ok === true) {
				canaryToast.info(`Cancelled operation for ${pluginDisplayName}`);
			} else {
				canaryToast.error(`Failed to cancel operation: ${cancelRes.error.message}`);
			}
		});
	}, [runTransition, isInstalling, onCancelInstall, workflowService, repo, pluginDisplayName]);

	const handleRetryInstall = useCallback((): void => {
		if (activeInstallation !== undefined && onRetryInstall !== undefined) {
			onRetryInstall(activeInstallation);
		}
	}, [activeInstallation, onRetryInstall]);

	const handleDiscardInstall = useCallback((): void => {
		if (activeInstallation !== undefined && onDiscardInstall !== undefined) {
			onDiscardInstall(activeInstallation);
		}
	}, [activeInstallation, onDiscardInstall]);

	const handleRetry = useMemo((): (() => void) | undefined => {
		if (overrideData?.onRetry !== undefined) {
			return overrideData.onRetry;
		}
		if (activeInstallation !== undefined) {
			return handleRetryInstall;
		}
		return undefined;
	}, [overrideData?.onRetry, activeInstallation, handleRetryInstall]);

	const viewState: PluginCardViewState = useMemo((): PluginCardViewState => {
		return {
			pluginDisplayName,
			manifestVersion,
			isIncompatible,
			manifestDescription,
			manifestAuthor,
			isBusy,
			hasActiveOperation,
			isFrozen,
			isUntracked: isTracked === false && isInstalling === false,
			isInstalling,
			installStatus,
			installErrorMessage,
			detectedUpdates,
			isLoading,
			isError,
			loadingMessage,
			errorMessage,
		};
	}, [
		pluginDisplayName,
		manifestVersion,
		isIncompatible,
		manifestDescription,
		manifestAuthor,
		isBusy,
		hasActiveOperation,
		isFrozen,
		isTracked,
		isInstalling,
		installStatus,
		installErrorMessage,
		detectedUpdates,
		isLoading,
		isError,
		loadingMessage,
		errorMessage,
	]);

	const viewActions: PluginCardViewActions = useMemo((): PluginCardViewActions => {
		return {
			handleUpdateClick,
			handleSettingsClick,
			handleDeleteClick,
			handleResetSettings,
			handleRegisterUntracked,
			handleClearDetectedUpdates,
			handleSelectDetectedUpdate,
			handleCancelOperation,
			handleRetryInstall,
			handleDiscardInstall,
			handleRetry,
		};
	}, [
		handleUpdateClick,
		handleSettingsClick,
		handleDeleteClick,
		handleResetSettings,
		handleRegisterUntracked,
		handleClearDetectedUpdates,
		handleSelectDetectedUpdate,
		handleCancelOperation,
		handleRetryInstall,
		handleDiscardInstall,
		handleRetry,
	]);

	return {
		state: viewState,
		actions: viewActions,
	};
}
