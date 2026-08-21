import { useState, useMemo, useEffect, useCallback } from "react";
import { debounce } from "es-toolkit";
import { create } from "mutative";

import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useBoolean } from "@/ui/hooks/useBoolean";
import { useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useDerivedReset } from "@/ui/hooks/useDerivedReset";
import { useService } from "@/ui/hooks/useService";
import { useSettingsMutations } from "@/ui/hooks/useSettingsMutations";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { useUpdateEffect } from "@/ui/hooks/useUpdateEffect";
import { safe } from "@/utils/safe";

import type { Draft } from "mutative";
import type {
	ChangelogPriority,
	PluginConfig,
	PluginConfigurationOverrides,
	Settings,
	ShowChangelogConfig,
	ShowChangelogMode,
} from "@/domain/types";

export interface UsePluginConfigurationOptions {
	readonly repo: string;
	readonly initialData: PluginConfig | undefined;
	readonly isLocked: boolean;
	readonly onClose: () => void;
}

export interface UsePluginConfigurationResult {
	readonly settings: Settings;
	readonly isFrozen: boolean;
	readonly config: PluginConfigurationOverrides;
	readonly tokenSecretId: string;
	readonly isPending: boolean;
	readonly setIsFrozen: (value: boolean) => void;
	readonly updateConfig: (key: keyof PluginConfigurationOverrides, value: unknown) => void;
	readonly updateShowChangelog: (subKey: "mode" | "priority", value: ShowChangelogMode | ChangelogPriority) => void;
	readonly updateCheckOnLoad: (subKey: "enabled" | "autoDownload", value: boolean) => void;
	readonly updateUpdateInterval: (subKey: "value" | "autoDownload", value: string | boolean) => void;
	readonly updateForceInstall: (subKey: "version" | "platform", value: boolean) => void;
	readonly setTokenSecretId: (value: string) => void;
	readonly flushPendingSave: () => void;
}

function deriveConfigurationOverrides(
	initialData: PluginConfig | undefined,
	globalShowChangelog?: Readonly<ShowChangelogConfig>,
): PluginConfigurationOverrides {
	const interval = initialData?.updateInterval;
	const checkOnLoad = initialData?.updateCheckOnLoad;
	const forceInstall = initialData?.forceInstall;
	const changelog = initialData?.showChangelog;

	let showChangelogOverride: ShowChangelogConfig | undefined;
	if (changelog !== undefined && (changelog.mode !== undefined || changelog.priority !== undefined)) {
		showChangelogOverride = {
			mode: changelog.mode ?? globalShowChangelog?.mode ?? "after",
			priority: changelog.priority ?? globalShowChangelog?.priority ?? "release_notes",
		};
	}

	return {
		autoEnable: initialData?.autoEnable,
		showChangelog: showChangelogOverride,
		releaseChannel: initialData?.releaseChannel,
		updateInterval: interval?.value !== undefined ? {
			value: interval.value,
			autoDownload: interval.autoDownload ?? true,
		} : undefined,
		updateCheckOnLoad: checkOnLoad?.enabled !== undefined ? {
			enabled: checkOnLoad.enabled,
			autoDownload: checkOnLoad.autoDownload ?? true,
		} : undefined,
		forceInstall: forceInstall !== undefined ? {
			version: forceInstall.version ?? false,
			platform: forceInstall.platform ?? false,
		} : undefined,
	};
}

export function usePluginConfiguration({
	repo,
	initialData,
	isLocked,
}: Readonly<UsePluginConfigurationOptions>): UsePluginConfigurationResult {
	const settingsService = useService("settingsService");

	const settings = useCanaryState((state) => {
		return state.settings;
	});
	const { updateSettings } = useSettingsMutations();
	const { isPending: isTransitionPending, runTransition } = useTransitionAction();

	const [isFrozen, { set: setIsFrozen }] = useBoolean(initialData?.status === "frozen");
	const [tokenSecretId, setTokenSecretId] = useState<string>(initialData?.tokenSecretId ?? "");
	const [config, setConfig] = useState<PluginConfigurationOverrides>((): PluginConfigurationOverrides => {
		return deriveConfigurationOverrides(initialData, settings.global.showChangelog);
	});

	useDerivedReset(initialData, (): void => {
		setIsFrozen(initialData?.status === "frozen");
		setTokenSecretId(initialData?.tokenSecretId ?? "");
		setConfig(deriveConfigurationOverrides(initialData, settings.global.showChangelog));
	});

	const persistSettings = useCallback(async (
		currentFrozen: boolean,
		currentConfig: PluginConfigurationOverrides,
		currentToken: string,
	): Promise<void> => {
		const settingsRes = settingsService.getSettings();
		const currentSettings = safe.unwrapOr(settingsRes, null);
		if (currentSettings === null) {
			return;
		}
		const expectedVersion = currentSettings.version;

		const saveResult = await safe.tryAsync((): Promise<void> => {
			return updateSettings.mutateAsync({
				recipe: (draft): void => {
					const targetPlugin = draft.plugins[repo];
					if (targetPlugin === undefined) {
						return;
					}

					targetPlugin.status = currentFrozen === true ? "frozen" : "active";
					targetPlugin.tokenSecretId = currentToken !== "" ? currentToken : undefined;
					targetPlugin.autoEnable = currentConfig.autoEnable;
					targetPlugin.showChangelog = currentConfig.showChangelog !== undefined ? { ...currentConfig.showChangelog } : undefined;
					targetPlugin.releaseChannel = currentConfig.releaseChannel;
					targetPlugin.updateInterval = currentConfig.updateInterval !== undefined ? { ...currentConfig.updateInterval } : undefined;
					targetPlugin.updateCheckOnLoad = currentConfig.updateCheckOnLoad !== undefined ? { ...currentConfig.updateCheckOnLoad } : undefined;
					targetPlugin.forceInstall = currentConfig.forceInstall !== undefined ? { ...currentConfig.forceInstall } : undefined;
				},
				expectedVersion,
			});
		});

		if (saveResult.ok === false) {
			const err = saveResult.error;
			canaryToast.error("Save failed", {
				description: err.message,
				id: `auto-save-${repo}`,
			});
		} else {
			canaryToast.success("Settings updated", {
				description: `Changes for ${repo} saved successfully.`,
				id: `auto-save-${repo}`,
				duration: 2000,
			});
		}
	}, [updateSettings, repo, settingsService]);

	const dbSave = useMemo(() => {
		return debounce((frozenVal: boolean, configVal: PluginConfigurationOverrides, tokenVal: string): void => {
			runTransition(async (): Promise<void> => {
				await persistSettings(frozenVal, configVal, tokenVal);
			});
		}, 500);
	}, [persistSettings, runTransition]);

	useEffect((): (() => void) => {
		return (): void => {
			dbSave.flush();
		};
	}, [dbSave]);

	useUpdateEffect((): void => {
		dbSave(isFrozen, config, tokenSecretId);
	}, [isFrozen, config, tokenSecretId]);

	const flushPendingSave = useCallback((): void => {
		dbSave.flush();
	}, [dbSave]);

	const executeAction = useCallback((action: () => void): void => {
		if (isLocked === true) {
			return;
		}
		runTransition(action);
	}, [isLocked, runTransition]);

	const updateConfigState = useCallback((mutator: (draft: Draft<PluginConfigurationOverrides>) => void): void => {
		executeAction((): void => {
			setConfig((prev: PluginConfigurationOverrides): PluginConfigurationOverrides => create(prev, mutator));
		});
	}, [executeAction]);

	const handleSetIsFrozen = useCallback((value: boolean): void => {
		executeAction((): void => {
			setIsFrozen(value);
		});
	}, [executeAction, setIsFrozen]);

	const handleSetTokenSecretId = useCallback((value: string): void => {
		executeAction((): void => {
			setTokenSecretId(value);
		});
	}, [executeAction]);

	const handleUpdateConfig = useCallback((key: keyof PluginConfigurationOverrides, value: unknown): void => {
		updateConfigState((draft): void => {
			if (key === "releaseChannel") {
				if (value === "stable" || value === "beta" || value === "canary") {
					draft[key] = value;
				}
			} else if (key === "autoEnable") {
				if (typeof value === "boolean") {
					draft[key] = value;
				}
			}
		});
	}, [updateConfigState]);

	const handleUpdateShowChangelog = useCallback((
		subKey: "mode" | "priority",
		value: ShowChangelogMode | ChangelogPriority,
	): void => {
		updateConfigState((draft): void => {
			const current = draft.showChangelog;
			const defaultMode = settings.global.showChangelog.mode;
			const defaultPriority = settings.global.showChangelog.priority;

			if (subKey === "mode") {
				if (value === "before" || value === "after") {
					draft.showChangelog = {
						mode: value,
						priority: current?.priority ?? defaultPriority,
					};
				}
			} else if (subKey === "priority") {
				if (value === "release_notes" || value === "changelog_file") {
					draft.showChangelog = {
						mode: current?.mode ?? defaultMode,
						priority: value,
					};
				}
			}
		});
	}, [updateConfigState, settings.global.showChangelog]);

	const handleUpdateCheckOnLoad = useCallback((subKey: "enabled" | "autoDownload", value: boolean): void => {
		updateConfigState((draft): void => {
			const current = draft.updateCheckOnLoad;
			draft.updateCheckOnLoad = {
				enabled: subKey === "enabled" ? value : (current?.enabled ?? true),
				autoDownload: subKey === "autoDownload" ? value : (current?.autoDownload ?? true),
			};
		});
	}, [updateConfigState]);

	const handleUpdateUpdateInterval = useCallback((subKey: "value" | "autoDownload", value: string | boolean): void => {
		updateConfigState((draft): void => {
			const current = draft.updateInterval;
			let nextValue: string | false = current?.value ?? false;
			let nextAutoDownload = current?.autoDownload ?? true;

			if (subKey === "value") {
				if (typeof value === "string" || value === false) {
					nextValue = value;
				}
			} else if (subKey === "autoDownload") {
				if (typeof value === "boolean") {
					nextAutoDownload = value;
				}
			}

			draft.updateInterval = {
				value: nextValue,
				autoDownload: nextAutoDownload,
			};
		});
	}, [updateConfigState]);

	const handleUpdateForceInstall = useCallback((subKey: "version" | "platform", value: boolean): void => {
		updateConfigState((draft): void => {
			const currentForceInstall = draft.forceInstall;
			draft.forceInstall = {
				version: subKey === "version" ? value : (currentForceInstall?.version ?? false),
				platform: subKey === "platform" ? value : (currentForceInstall?.platform ?? false),
			};
		});
	}, [updateConfigState]);

	return {
		settings,
		isFrozen,
		config,
		tokenSecretId,
		isPending: updateSettings.isPending || isTransitionPending,
		setIsFrozen: handleSetIsFrozen,
		updateConfig: handleUpdateConfig,
		updateShowChangelog: handleUpdateShowChangelog,
		updateCheckOnLoad: handleUpdateCheckOnLoad,
		updateUpdateInterval: handleUpdateUpdateInterval,
		updateForceInstall: handleUpdateForceInstall,
		setTokenSecretId: handleSetTokenSecretId,
		flushPendingSave,
	};
}
