import { lazy, type JSX } from "react";
import { clsx } from "clsx";
import { match } from "ts-pattern";

import { CategorySelector } from "@/ui/components/CategorySelector";
import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";
import { SharedGeneralTab, SharedUpdateRulesTab, SharedAutomationTab } from "@/ui/components/SharedSettingsTabs";
import { usePluginSettingsViewModel } from "@/ui/hooks/usePluginSettingsViewModel";

import type {
	ChangelogPriority,
	PluginConfig,
	PluginConfigurationOverrides,
	ReleaseChannel,
	Settings,
	ShowChangelogConfig,
	ShowChangelogMode,
	UpdateCheckOnLoadConfig,
	UpdateIntervalConfig,
} from "@/domain/types";

const LazySharedReadmeTab = lazy(async () => {
	const mod = await import("@/ui/components/SharedReadmeTab");
	return { default: mod.SharedReadmeTab };
});

const LazyPluginVersionAuthTab = lazy(async () => {
	const mod = await import("@/ui/components/PluginVersionAuthTab");
	return { default: mod.PluginVersionAuthTab };
});

const LazyPluginVersionChangelogPreview = lazy(async () => {
	const mod = await import("@/ui/components/PluginVersionChangelogPreview");
	return { default: mod.PluginVersionChangelogPreview };
});

export interface PluginSettingsViewProps {
	readonly repo: string;
	readonly initialData: PluginConfig | undefined;
	readonly onClose: () => void;
	readonly isLocked?: boolean | undefined;
}

interface PluginGeneralSettingsTabProps {
	readonly isBusy: boolean;
	readonly isFrozen: boolean;
	readonly config: PluginConfigurationOverrides;
	readonly globalSettings: Settings;
	readonly effectiveShowChangelog: ShowChangelogConfig;
	readonly globalChangelogModeText: string;
	readonly globalChangelogPriorityText: string;
	readonly setIsFrozen: (frozen: boolean) => void;
	readonly updateConfig: (key: keyof PluginConfigurationOverrides, value: unknown) => void;
	readonly updateShowChangelog: (subKey: "mode" | "priority", value: ShowChangelogMode | ChangelogPriority) => void;
	readonly updateForceInstall: (subKey: "version" | "platform", value: boolean) => void;
}

function PluginGeneralSettingsTab({
	isBusy,
	isFrozen,
	config,
	globalSettings,
	effectiveShowChangelog,
	globalChangelogModeText,
	globalChangelogPriorityText,
	setIsFrozen,
	updateConfig,
	updateShowChangelog,
	updateForceInstall,
}: PluginGeneralSettingsTabProps): JSX.Element {
	return (
		<SharedGeneralTab
			autoEnable={config.autoEnable ?? globalSettings.global.autoEnable}
			autoEnableHint={<>Global Default: <strong>{globalSettings.global.autoEnable ? "Enabled" : "Disabled"}</strong></>}
			changelogPriorityHint={<>Global Default: <strong>{globalChangelogPriorityText}</strong></>}
			forcePlatform={config.forceInstall?.platform ?? globalSettings.global.forceInstall.platform}
			forcePlatformHint={<>Global Default: <strong>{globalSettings.global.forceInstall.platform ? "Allowed" : "Blocked"}</strong></>}
			forceVersion={config.forceInstall?.version ?? globalSettings.global.forceInstall.version}
			forceVersionHint={<>Global Default: <strong>{globalSettings.global.forceInstall.version ? "Allowed" : "Blocked"}</strong></>}
			frozenHint={<>Status: <strong>{isFrozen ? "Frozen" : "Unfrozen"}</strong></>}
			isBusy={isBusy}
			isFrozen={isFrozen}
			showChangelog={effectiveShowChangelog}
			showChangelogModeHint={<>Global Default: <strong>{globalChangelogModeText}</strong></>}
			onAutoEnableChange={(v: boolean): void => {
				updateConfig("autoEnable", v);
			}}
			onChangelogPriorityChange={(v: ChangelogPriority): void => {
				updateShowChangelog("priority", v);
			}}
			onForcePlatformChange={(v: boolean): void => {
				updateForceInstall("platform", v);
			}}
			onForceVersionChange={(v: boolean): void => {
				updateForceInstall("version", v);
			}}
			onFrozenChange={(v: boolean): void => {
				if (!isBusy) {
					setIsFrozen(v);
				}
			}}
			onShowChangelogModeChange={(v: ShowChangelogMode): void => {
				updateShowChangelog("mode", v);
			}}
		/>
	);
}

interface PluginUpdateRulesTabProps {
	readonly isBusy: boolean;
	readonly isFrozen: boolean;
	readonly releaseChannel: ReleaseChannel;
	readonly globalReleaseChannel: ReleaseChannel;
	readonly updateConfig: (key: keyof PluginConfigurationOverrides, value: unknown) => void;
}

function PluginUpdateRulesTab({
	isBusy,
	isFrozen,
	releaseChannel,
	globalReleaseChannel,
	updateConfig,
}: PluginUpdateRulesTabProps): JSX.Element {
	return (
		<SharedUpdateRulesTab
			isBusy={isBusy}
			isFrozen={isFrozen}
			releaseChannel={releaseChannel}
			releaseChannelHint={<>Global Default: <strong>{globalReleaseChannel}</strong></>}
			onReleaseChannelChange={(v: ReleaseChannel): void => {
				updateConfig("releaseChannel", v);
			}}
		/>
	);
}

interface PluginAutomationTabProps {
	readonly isBusy: boolean;
	readonly config: PluginConfigurationOverrides;
	readonly globalSettings: Settings;
	readonly updateCheckOnLoad: (subKey: "enabled" | "autoDownload", value: boolean) => void;
	readonly updateUpdateInterval: (subKey: "value" | "autoDownload", value: string | boolean) => void;
}

function PluginAutomationTab({
	isBusy,
	config,
	globalSettings,
	updateCheckOnLoad,
	updateUpdateInterval,
}: PluginAutomationTabProps): JSX.Element {
	const checkOnLoadConfig: UpdateCheckOnLoadConfig = {
		enabled: config.updateCheckOnLoad?.enabled ?? globalSettings.global.updateCheckOnLoad.enabled,
		autoDownload: config.updateCheckOnLoad?.autoDownload ?? globalSettings.global.updateCheckOnLoad.autoDownload,
	};

	const updateIntervalConfig: UpdateIntervalConfig = {
		value: config.updateInterval?.value ?? globalSettings.global.updateInterval.value,
		autoDownload: config.updateInterval?.autoDownload ?? globalSettings.global.updateInterval.autoDownload,
	};

	return (
		<SharedAutomationTab
			checkOnLoad={checkOnLoadConfig}
			isBusy={isBusy}
			updateInterval={updateIntervalConfig}
			onCheckOnLoadAutoDownloadChange={(v: boolean): void => {
				updateCheckOnLoad("autoDownload", v);
			}}
			onCheckOnLoadEnabledChange={(v: boolean): void => {
				updateCheckOnLoad("enabled", v);
			}}
			onUpdateIntervalAutoDownloadChange={(v: boolean): void => {
				updateUpdateInterval("autoDownload", v);
			}}
			onUpdateIntervalValueChange={(v: string | false): void => {
				updateUpdateInterval("value", v);
			}}
		/>
	);
}

export function PluginSettingsView(props: PluginSettingsViewProps): JSX.Element {
	const { repo, initialData, onClose, isLocked } = props;
	const isLockedActive = isLocked ?? false;

	const { state, actions } = usePluginSettingsViewModel(repo, initialData, isLockedActive, onClose);
	const tokenSecretId = state.tokenSecretId !== "" ? state.tokenSecretId : undefined;

	return (
		<div className="ce-plugin-settings-view">
			<CategorySelector
				activeCategory={state.activeCategory}
				categories={state.categories}
				isDisabled={state.isBusy}
				onCategoryChange={actions.setActiveCategory}
			/>

			<div className={clsx("ce-settings-grid", state.isBusy ? "is-locked" : "")}>
				{match(state.activeCategory)
					.with("General", (): JSX.Element => (
						<PluginGeneralSettingsTab
							config={state.config}
							effectiveShowChangelog={state.effectiveShowChangelog}
							globalChangelogModeText={state.globalChangelogModeText}
							globalChangelogPriorityText={state.globalChangelogPriorityText}
							globalSettings={state.settings}
							isBusy={state.isBusy}
							isFrozen={state.isFrozen}
							setIsFrozen={actions.setIsFrozen}
							updateConfig={actions.updateConfig}
							updateForceInstall={actions.updateForceInstall}
							updateShowChangelog={actions.updateShowChangelog}
						/>
					))
					.with("Update Rules", (): JSX.Element => (
						<PluginUpdateRulesTab
							globalReleaseChannel={state.settings.global.releaseChannel}
							isBusy={state.isBusy}
							isFrozen={state.isFrozen}
							releaseChannel={state.effectiveChannel}
							updateConfig={actions.updateConfig}
						/>
					))
					.with("Automation", (): JSX.Element => (
						<PluginAutomationTab
							config={state.config}
							globalSettings={state.settings}
							isBusy={state.isBusy}
							updateCheckOnLoad={actions.updateCheckOnLoad}
							updateUpdateInterval={actions.updateUpdateInterval}
						/>
					))
					.with("Version & Auth", (): JSX.Element => (
						<LazyPanelBoundary loadingMessage="Loading version and authentication settings...">
							<LazyPluginVersionAuthTab
								channel={state.effectiveChannel}
								currentVersion={state.currentVersion}
								handleInstallVersion={actions.handleInstallVersion}
								installButtonText={state.installButtonText}
								isBusy={state.isBusy}
								isVersionsSuccess={state.isVersionsSuccess}
								isValidatingToken={state.isValidatingToken}
								repoUrl={repo}
								secretOptions={state.secretOptions}
								selectedVersion={state.selectedVersion}
								setSelectedVersion={actions.setSelectedVersion}
								setTokenSecretId={actions.setTokenSecretId}
								tokenSecretId={state.tokenSecretId}
								versions={state.versions}
							/>
						</LazyPanelBoundary>
					))
					.with("README", (): JSX.Element => (
						<LazyPanelBoundary loadingMessage="Loading plugin README...">
							<LazySharedReadmeTab
								isEnabled={state.activeCategory === "README"}
								repoUrl={repo}
								tokenSecretId={state.tokenSecretId}
							/>
						</LazyPanelBoundary>
					))
					.exhaustive()}
			</div>

			{state.activeCategory === "Version & Auth" ? (
				<LazyPanelBoundary loadingMessage="Loading version changelog preview...">
					<LazyPluginVersionChangelogPreview
						channel={state.effectiveChannel}
						priority={state.effectivePriority}
						repoUrl={repo}
						tokenSecretId={tokenSecretId}
						version={state.previewVersion}
					/>
				</LazyPanelBoundary>
			) : null}
		</div>
	);
}
