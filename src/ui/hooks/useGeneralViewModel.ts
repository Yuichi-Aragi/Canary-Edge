import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import PQueue from "p-queue";

import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useSettingsMutations } from "@/ui/hooks/useSettingsMutations";
import { useValidateToken } from "@/ui/hooks/useGitHub";
import { useCategoryTab } from "@/ui/hooks/useCategoryTab";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { getAvailableSecrets } from "@/utils/secretUtils";
import { useService } from "@/ui/hooks/useService";
import { safe } from "@/utils/safe";

import type {
	ChangelogPriority,
	ReleaseChannel,
	Settings,
	ShowChangelogMode,
} from "@/domain/types";
import type { Draft } from "mutative";

export type GeneralCategory = "Installation" | "Update Rules" | "Automation" | "Integrations";

export interface GeneralViewState {
	readonly settings: Settings;
	readonly activeCategory: GeneralCategory;
	readonly secretOptions: readonly { readonly label: string; readonly value: string }[];
	readonly isValidatingToken: boolean;
	readonly currentSecretId: string;
	readonly isPending: boolean;
	readonly pendingSettingKey: string | null;
}

export interface GeneralViewActions {
	readonly setActiveCategory: (category: GeneralCategory) => void;
	readonly updateAutoEnable: (value: boolean) => void;
	readonly updateCheckOnLoadEnabled: (value: boolean) => void;
	readonly updateCheckOnLoadAutoDownload: (value: boolean) => void;
	readonly updateShowChangelogMode: (value: ShowChangelogMode) => void;
	readonly updateChangelogPriority: (value: ChangelogPriority) => void;
	readonly updateForceInstall: (key: "version" | "platform", value: boolean) => void;
	readonly updateReleaseChannel: (value: ReleaseChannel) => void;
	readonly updateIntervalValue: (value: string | false) => void;
	readonly updateIntervalAutoDownload: (value: boolean) => void;
	readonly updateTokenSecretId: (value: string) => void;
	readonly updateEnableBratSync: (value: boolean) => void;
}

export interface GeneralViewModel {
	readonly state: GeneralViewState;
	readonly actions: GeneralViewActions;
}

export function useGeneralViewModel(): GeneralViewModel {
	const mainPlugin = useService("plugin");
	const settingsService = useService("settingsService");
	const { app } = mainPlugin;

	const settings = useCanaryState((state) => state.settings);
	const { updateSettings } = useSettingsMutations();
	const { isPending: isTransitionPending, runTransition } = useTransitionAction();
	const [pendingSettingKey, setPendingSettingKey] = useState<string | null>(null);

	const { activeCategory, setActiveCategory } = useCategoryTab<GeneralCategory>("Installation");

	const mutationQueue = useMemo((): PQueue => new PQueue({ concurrency: 1 }), []);

	useEffect((): (() => void) => {
		return (): void => {
			mutationQueue.clear();
		};
	}, [mutationQueue]);

	const secretOptions = useMemo((): readonly { readonly label: string; readonly value: string }[] => {
		const availableSecrets = getAvailableSecrets(app);
		return [
			{ label: "None", value: "" },
			...availableSecrets.map((secretName: string) => ({
				label: secretName,
				value: secretName,
			})),
		];
	}, [app]);

	const currentSecretId = useMemo((): string => {
		const rawToken = settings.global.tokenSecretId;
		if (rawToken === false || rawToken === undefined || rawToken === null) {
			return "";
		}
		return rawToken;
	}, [settings.global.tokenSecretId]);

	const validationSessionRef = useRef<number>(0);
	const notifiedSessionRef = useRef<number>(0);

	useEffect((): void => {
		validationSessionRef.current += 1;
	}, [currentSecretId]);

	const { data: tokenInfo, isLoading: isValidatingToken, isSuccess: isTokenChecked } = useValidateToken(
		currentSecretId,
		currentSecretId !== "",
	);

	useEffect((): void => {
		const currentSession = validationSessionRef.current;

		if (
			currentSecretId === "" ||
			isValidatingToken === true ||
			isTokenChecked === false ||
			tokenInfo === null ||
			tokenInfo === undefined ||
			notifiedSessionRef.current === currentSession
		) {
			return;
		}

		notifiedSessionRef.current = currentSession;

		if (tokenInfo.validToken === true) {
			const scopes = tokenInfo.currentScopes.join(", ");
			canaryToast.success("GitHub Token Validated", {
				description: scopes !== "" ? `Scopes: ${scopes}` : "Scopes: none",
				id: "pat-validation",
				duration: 4000,
			});
		} else {
			canaryToast.error("Invalid GitHub Token", {
				description: tokenInfo.error.message,
				id: "pat-validation",
				duration: 6000,
			});
		}
	}, [tokenInfo, isValidatingToken, isTokenChecked, currentSecretId]);

	const mutateGlobal = useCallback(
		(
			settingName: string,
			settingKey: string,
			recipe: (draftGlobal: Draft<Settings["global"]>) => void,
		): void => {
			setPendingSettingKey(settingKey);

			void mutationQueue.add(async (): Promise<void> => {
				await safe.async(async (_$, defer): Promise<void> => {
					defer((): void => {
						runTransition((): void => {
							if (mutationQueue.size === 0) {
								setPendingSettingKey(null);
							}
						});
					});

					const currentSettingsRes = settingsService.getSettings();
					const currentSettings = safe.unwrapOr(currentSettingsRes, null);

					if (currentSettings === null) {
						canaryToast.error("Failed to read store settings", {
							description: "Setting update could not be processed.",
							id: "global-setting-error",
						});
						return;
					}

					const expectedVersion = currentSettings.version;

					const result = await safe.tryAsync((): Promise<void> => {
						return updateSettings.mutateAsync({
							recipe: (draft): void => {
								recipe(draft.global);
							},
							expectedVersion,
						});
					});

					runTransition((): void => {
						if (result.ok === true) {
							canaryToast.success("Setting updated", {
								description: `${settingName} updated successfully.`,
								id: `global-setting-${settingKey}`,
								duration: 2500,
							});
						} else {
							canaryToast.error("Failed to update setting", {
								description: result.error.message,
								id: "global-setting-error",
							});
						}
					});
				});
			});
		},
		[mutationQueue, settingsService, updateSettings, runTransition],
	);

	const actions: GeneralViewActions = useMemo((): GeneralViewActions => {
		return {
			setActiveCategory,
			updateAutoEnable: (value: boolean): void => {
				mutateGlobal("Auto-enable after install", "auto-enable", (draftGlobal): void => {
					draftGlobal.autoEnable = value;
				});
			},
			updateCheckOnLoadEnabled: (value: boolean): void => {
				mutateGlobal("Check for updates on load", "check-on-load-enabled", (draftGlobal): void => {
					draftGlobal.updateCheckOnLoad.enabled = value;
				});
			},
			updateCheckOnLoadAutoDownload: (value: boolean): void => {
				mutateGlobal("Auto-download on load", "check-on-load-auto-download", (draftGlobal): void => {
					draftGlobal.updateCheckOnLoad.autoDownload = value;
				});
			},
			updateShowChangelogMode: (value: ShowChangelogMode): void => {
				mutateGlobal("Show changelog timing", "show-changelog-mode", (draftGlobal): void => {
					draftGlobal.showChangelog.mode = value;
				});
			},
			updateChangelogPriority: (value: ChangelogPriority): void => {
				mutateGlobal("Changelog source priority", "changelog-priority", (draftGlobal): void => {
					draftGlobal.showChangelog.priority = value;
				});
			},
			updateForceInstall: (key: "version" | "platform", value: boolean): void => {
				mutateGlobal(
					key === "version" ? "Allow incompatible versions" : "Allow incompatible platforms",
					`force-install-${key}`,
					(draftGlobal): void => {
						draftGlobal.forceInstall[key] = value;
					},
				);
			},
			updateReleaseChannel: (value: ReleaseChannel): void => {
				mutateGlobal("Release channel", "release-channel", (draftGlobal): void => {
					draftGlobal.releaseChannel = value;
				});
			},
			updateIntervalValue: (value: string | false): void => {
				mutateGlobal("Update check interval", "update-interval-value", (draftGlobal): void => {
					draftGlobal.updateInterval.value = value;
				});
			},
			updateIntervalAutoDownload: (value: boolean): void => {
				mutateGlobal("Auto-download on interval", "update-interval-auto-download", (draftGlobal): void => {
					draftGlobal.updateInterval.autoDownload = value;
				});
			},
			updateTokenSecretId: (value: string): void => {
				mutateGlobal("Personal access token", "token-secret-id", (draftGlobal): void => {
					draftGlobal.tokenSecretId = value !== "" ? value : false;
				});
			},
			updateEnableBratSync: (value: boolean): void => {
				mutateGlobal("BRAT synchronization", "enable-brat-sync", (draftGlobal): void => {
					draftGlobal.enableBratSync = value;
				});
			},
		};
	}, [setActiveCategory, mutateGlobal]);

	const isBusy = updateSettings.isPending || isTransitionPending || pendingSettingKey !== null;

	return {
		state: {
			settings,
			activeCategory,
			secretOptions,
			isValidatingToken,
			currentSecretId,
			isPending: isBusy,
			pendingSettingKey,
		},
		actions,
	};
}
