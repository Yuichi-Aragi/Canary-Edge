import { useCallback, useMemo, useState } from "react";

import { useCategoryTab } from "@/ui/hooks/useCategoryTab";
import { useDerivedReset } from "@/ui/hooks/useDerivedReset";
import { useReleaseVersions, useValidateToken } from "@/ui/hooks/useGitHub";
import { usePluginConfiguration } from "@/ui/hooks/usePluginConfiguration";
import { usePluginManifest } from "@/ui/hooks/usePluginManifest";
import { usePluginOperations } from "@/ui/hooks/usePluginOperations";
import { useService } from "@/ui/hooks/useService";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { safe } from "@/utils/safe";
import { getAvailableSecrets } from "@/utils/secretUtils";
import { compareVersions } from "@/utils/semverUtils";

import type {
	ChangelogPriority,
	PluginConfig,
	PluginConfigurationOverrides,
	ReleaseChannel,
	ReleaseVersion,
	Settings,
	ShowChangelogConfig,
	ShowChangelogMode,
} from "@/domain/types";

export type PluginSettingCategory = "General" | "Update Rules" | "Automation" | "Version & Auth" | "README";

export interface PluginSettingsViewState {
	readonly activeCategory: PluginSettingCategory;
	readonly categories: readonly PluginSettingCategory[];
	readonly isBusy: boolean;
	readonly isFrozen: boolean;
	readonly config: PluginConfigurationOverrides;
	readonly settings: Settings;
	readonly tokenSecretId: string;
	readonly secretOptions: readonly string[];
	readonly isValidatingToken: boolean;
	readonly currentVersion: string;
	readonly isVersionsSuccess: boolean;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly selectedVersion: string;
	readonly installButtonText: string;
	readonly effectiveChannel: ReleaseChannel;
	readonly effectivePriority: ChangelogPriority;
	readonly effectiveShowChangelog: ShowChangelogConfig;
	readonly previewVersion: string;
	readonly globalChangelogModeText: string;
	readonly globalChangelogPriorityText: string;
}

export interface PluginSettingsViewActions {
	readonly setActiveCategory: (cat: PluginSettingCategory) => void;
	readonly setIsFrozen: (frozen: boolean) => void;
	readonly updateConfig: (key: keyof PluginConfigurationOverrides, value: unknown) => void;
	readonly updateShowChangelog: (subKey: "mode" | "priority", value: ShowChangelogMode | ChangelogPriority) => void;
	readonly updateCheckOnLoad: (subKey: "enabled" | "autoDownload", value: boolean) => void;
	readonly updateUpdateInterval: (subKey: "value" | "autoDownload", value: string | boolean) => void;
	readonly updateForceInstall: (subKey: "version" | "platform", value: boolean) => void;
	readonly setTokenSecretId: (val: string) => void;
	readonly setSelectedVersion: (val: string) => void;
	readonly handleInstallVersion: () => void;
}

export interface PluginSettingsViewModel {
	readonly state: PluginSettingsViewState;
	readonly actions: PluginSettingsViewActions;
}

interface ResolvedVersionState {
	readonly resolvedVersion: string;
	readonly isDowngrade: boolean;
	readonly installButtonText: string;
}

const CATEGORIES: readonly PluginSettingCategory[] = [
	"General",
	"Update Rules",
	"Automation",
	"Version & Auth",
	"README",
] as const;

function resolveTargetVersion(
	selectedVersion: string,
	versions: readonly ReleaseVersion[] | undefined,
): string {
	if (selectedVersion === "latest" && versions !== undefined && versions.length > 0) {
		return versions[0]?.version ?? "latest";
	}
	return selectedVersion;
}

function computeVersionState(
	selectedVersion: string,
	currentVersion: string,
	versions: readonly ReleaseVersion[] | undefined,
): ResolvedVersionState {
	if (currentVersion === "Unknown") {
		return {
			resolvedVersion: selectedVersion,
			isDowngrade: false,
			installButtonText: "Install",
		};
	}

	const targetVersion = resolveTargetVersion(selectedVersion, versions);

	if (selectedVersion === "latest" && (versions === undefined || versions.length === 0)) {
		return {
			resolvedVersion: targetVersion,
			isDowngrade: false,
			installButtonText: "Reinstall",
		};
	}

	if (targetVersion === "latest" || targetVersion === currentVersion) {
		return {
			resolvedVersion: targetVersion,
			isDowngrade: false,
			installButtonText: "Reinstall",
		};
	}

	const comparison = compareVersions(targetVersion, currentVersion);
	const isDowngrade = comparison === -1;

	let installButtonText = "Reinstall";
	if (isDowngrade === true) {
		installButtonText = "Downgrade";
	} else if (comparison === 1) {
		installButtonText = "Upgrade";
	}

	return {
		resolvedVersion: targetVersion,
		isDowngrade,
		installButtonText,
	};
}

export function usePluginSettingsViewModel(
	repo: string,
	initialData: PluginConfig | undefined,
	isLockedActive: boolean,
	onClose: () => void,
): PluginSettingsViewModel {
	const mainPlugin = useService("plugin");
	const { isPending: isTransitionPending, runTransition } = useTransitionAction();

	const {
		settings,
		isFrozen,
		config,
		tokenSecretId,
		isPending: isSaving,
		setIsFrozen,
		updateConfig,
		updateShowChangelog,
		updateCheckOnLoad,
		updateUpdateInterval,
		updateForceInstall,
		setTokenSecretId,
		flushPendingSave,
	} = usePluginConfiguration({ repo, initialData, isLocked: isLockedActive, onClose });

	const { activeCategory, setActiveCategory } = useCategoryTab<PluginSettingCategory>("General");
	const { installPlugin } = usePluginOperations();

	const isBusy = isLockedActive === true || installPlugin.isPending === true || isSaving === true || isTransitionPending === true;

	const secretOptions = useMemo((): readonly string[] => {
		return getAvailableSecrets(mainPlugin.app);
	}, [mainPlugin.app]);

	const { isLoading: isValidatingToken } = useValidateToken(
		tokenSecretId,
		tokenSecretId !== "",
	);

	const { data: versions, isSuccess: isVersionsSuccess } = useReleaseVersions(
		repo,
		tokenSecretId,
		true,
	);

	const { data: manifest } = usePluginManifest(repo);
	const currentVersion = manifest?.version ?? "Unknown";

	const [selectedVersion, setSelectedVersion] = useState<string>("latest");

	useDerivedReset(repo, (): void => {
		setSelectedVersion("latest");
	});

	const handleSetSelectedVersion = useCallback(
		(val: string): void => {
			runTransition((): void => {
				setSelectedVersion(val);
			});
		},
		[runTransition],
	);

	const versionState = useMemo((): ResolvedVersionState => {
		return computeVersionState(selectedVersion, currentVersion, versions);
	}, [selectedVersion, currentVersion, versions]);

	const effectiveChannel: ReleaseChannel = config.releaseChannel ?? settings.global.releaseChannel;
	const effectivePriority: ChangelogPriority = config.showChangelog?.priority ?? settings.global.showChangelog.priority;
	const previewVersion: string = versionState.resolvedVersion;

	const effectiveShowChangelog: ShowChangelogConfig = useMemo((): ShowChangelogConfig => {
		return {
			mode: config.showChangelog?.mode ?? settings.global.showChangelog.mode,
			priority: config.showChangelog?.priority ?? settings.global.showChangelog.priority,
		};
	}, [config.showChangelog, settings.global.showChangelog]);

	const globalChangelogModeText = settings.global.showChangelog.mode === "before"
		? "Before install/update"
		: "After install/update";

	const globalChangelogPriorityText = settings.global.showChangelog.priority === "release_notes"
		? "Release notes (fallback to changelog file)"
		: "Changelog file (fallback to release notes)";

	const handleInstallVersion = useCallback((): void => {
		flushPendingSave();

		runTransition((): void => {
			const res = safe.try((): void => {
				const forceInstallConfig = config.forceInstall;
				const overridesObj: PluginConfigurationOverrides | undefined = {
					forceInstall: forceInstallConfig !== undefined ? {
						version: forceInstallConfig.version,
						platform: forceInstallConfig.platform,
					} : undefined,
					autoEnable: config.autoEnable,
					showChangelog: config.showChangelog,
					releaseChannel: config.releaseChannel,
				};

				installPlugin.mutate(
					{
						repo,
						version: versionState.resolvedVersion,
						isFrozen: versionState.isDowngrade === true ? true : isFrozen,
						tokenSecretId: tokenSecretId !== "" ? tokenSecretId : undefined,
						enableAfterInstall: config.autoEnable ?? settings.global.autoEnable,
						forceReinstall: true,
						overrides: overridesObj,
					},
					{
						onSuccess: (): void => {
							if (versionState.isDowngrade === true) {
								setIsFrozen(true);
							}
						},
					},
				);
			});

			if (res.ok === false) {
				console.error("[usePluginSettingsViewModel] Failed to execute install version:", res.error);
			}
		});
	}, [
		flushPendingSave,
		runTransition,
		config.forceInstall,
		config.autoEnable,
		config.showChangelog,
		config.releaseChannel,
		installPlugin,
		repo,
		versionState,
		isFrozen,
		tokenSecretId,
		settings.global.autoEnable,
		setIsFrozen,
	]);

	return {
		state: {
			activeCategory,
			categories: CATEGORIES,
			isBusy,
			isFrozen,
			config,
			settings,
			tokenSecretId,
			secretOptions,
			isValidatingToken,
			currentVersion,
			isVersionsSuccess,
			versions,
			selectedVersion,
			installButtonText: versionState.installButtonText,
			effectiveChannel,
			effectivePriority,
			effectiveShowChangelog,
			previewVersion,
			globalChangelogModeText,
			globalChangelogPriorityText,
		},
		actions: {
			setActiveCategory,
			setIsFrozen,
			updateConfig,
			updateShowChangelog,
			updateCheckOnLoad,
			updateUpdateInterval,
			updateForceInstall,
			setTokenSecretId,
			setSelectedVersion: handleSetSelectedVersion,
			handleInstallVersion,
		},
	};
}
