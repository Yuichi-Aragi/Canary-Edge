import { Suspense, type JSX, type ReactNode } from "react";
import { formatDuration as dateFnsFormatDuration, intervalToDuration } from "date-fns";

import { ToggleSettingsBox } from "@/ui/components/ToggleSettingsBox";
import { SettingsBox } from "@/ui/components/SettingsBox";
import { Slider } from "@/ui/components/BaseComponents";
import { parseDurationToMinutes, formatMinutesToDuration } from "@/utils/dateUtils";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type {
	ChangelogPriority,
	ReleaseChannel,
	ShowChangelogConfig,
	ShowChangelogMode,
	UpdateCheckOnLoadConfig,
	UpdateIntervalConfig,
} from "@/domain/types";
import type { ReleaseChannelDropdownProps } from "@/ui/components/ReleaseChannelDropdown";
import type {
	ShowChangelogDropdownProps,
	ChangelogPriorityDropdownProps,
} from "@/ui/components/ShowChangelogDropdown";

const LazyShowChangelogDropdown = lazyWithPreload<ShowChangelogDropdownProps>(async () => {
	const mod = await import("@/ui/components/ShowChangelogDropdown");
	return { default: mod.ShowChangelogDropdown };
});

const LazyChangelogPriorityDropdown = lazyWithPreload<ChangelogPriorityDropdownProps>(async () => {
	const mod = await import("@/ui/components/ShowChangelogDropdown");
	return { default: mod.ChangelogPriorityDropdown };
});

const LazyReleaseChannelDropdown = lazyWithPreload<ReleaseChannelDropdownProps>(async () => {
	const mod = await import("@/ui/components/ReleaseChannelDropdown");
	return { default: mod.ReleaseChannelDropdown };
});

const MIN_MINUTES = 180;
const MAX_MINUTES = 43200;

function formatDuration(minutes: number): string {
	return dateFnsFormatDuration(
		intervalToDuration({ start: 0, end: minutes * 60 * 1000 }),
	);
}

export interface SharedGeneralTabProps {
	readonly isBusy: boolean;
	readonly isFrozen?: boolean | undefined;
	readonly onFrozenChange?: ((v: boolean) => void) | undefined;
	readonly frozenHint?: ReactNode | undefined;

	readonly autoEnable: boolean;
	readonly onAutoEnableChange: (v: boolean) => void;
	readonly autoEnableHint?: ReactNode | undefined;

	readonly showChangelog: ShowChangelogConfig;
	readonly onShowChangelogModeChange: (v: ShowChangelogMode) => void;
	readonly showChangelogModeHint?: ReactNode | undefined;
	readonly onChangelogPriorityChange: (v: ChangelogPriority) => void;
	readonly changelogPriorityHint?: ReactNode | undefined;

	readonly forceVersion: boolean;
	readonly onForceVersionChange: (v: boolean) => void;
	readonly forceVersionHint?: ReactNode | undefined;

	readonly forcePlatform: boolean;
	readonly onForcePlatformChange: (v: boolean) => void;
	readonly forcePlatformHint?: ReactNode | undefined;
}

export function SharedGeneralTab({
	isBusy,
	isFrozen,
	onFrozenChange,
	frozenHint,
	autoEnable,
	onAutoEnableChange,
	autoEnableHint,
	showChangelog,
	onShowChangelogModeChange,
	showChangelogModeHint,
	onChangelogPriorityChange,
	changelogPriorityHint,
	forceVersion,
	onForceVersionChange,
	forceVersionHint,
	forcePlatform,
	onForcePlatformChange,
	forcePlatformHint,
}: SharedGeneralTabProps): JSX.Element {
	return (
		<>
			{isFrozen !== undefined && onFrozenChange !== undefined ? (
				<ToggleSettingsBox
					checked={isFrozen}
					description="Prevent this plugin from being automatically updated. This overrides all other update rules."
					globalHint={frozenHint}
					icon="snowflake"
					iconVariant="blue"
					isDisabled={isBusy}
					title="Freeze Plugin"
					onChange={onFrozenChange}
				/>
			) : null}
			<ToggleSettingsBox
				checked={autoEnable}
				description="Automatically enable this plugin after it is installed or updated."
				globalHint={autoEnableHint}
				icon="power"
				iconVariant="green"
				isDisabled={isBusy}
				title="Auto-enable after install"
				onChange={onAutoEnableChange}
			/>
			<SettingsBox
				control={
					<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
						<LazyShowChangelogDropdown
							disabled={isBusy}
							value={showChangelog.mode}
							onChange={onShowChangelogModeChange}
						/>
					</Suspense>
				}
				description="Select when to display the plugin change log during installation or update."
				globalHint={showChangelogModeHint}
				icon="file-text"
				iconVariant="orange"
				isDisabled={isBusy}
				title="Show changelog"
			/>
			<SettingsBox
				control={
					<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
						<LazyChangelogPriorityDropdown
							disabled={isBusy}
							value={showChangelog.priority}
							onChange={onChangelogPriorityChange}
						/>
					</Suspense>
				}
				description="Select which source to prioritize when fetching changelogs. Always falls back to the alternate source if unavailable."
				globalHint={changelogPriorityHint}
				icon="git-commit"
				iconVariant="yellow"
				isDisabled={isBusy}
				title="Changelog source priority"
			/>
			<ToggleSettingsBox
				checked={forceVersion}
				description="Allow installing versions requiring a higher Obsidian version than currently installed."
				globalHint={forceVersionHint}
				icon="alert-triangle"
				iconVariant="red"
				isDisabled={isBusy}
				title="Allow incompatible versions (API)"
				onChange={onForceVersionChange}
			/>
			<ToggleSettingsBox
				checked={forcePlatform}
				description="Allow installing desktop-only versions of this plugin on mobile devices."
				globalHint={forcePlatformHint}
				icon="smartphone"
				iconVariant="purple"
				isDisabled={isBusy}
				title="Allow incompatible platforms (Mobile)"
				onChange={onForcePlatformChange}
			/>
		</>
	);
}

export interface SharedIntegrationsTabProps {
	readonly isBusy: boolean;
	readonly enableBratSync: boolean;
	readonly onEnableBratSyncChange: (v: boolean) => void;
	readonly enableBratSyncHint?: ReactNode | undefined;
}

export function SharedIntegrationsTab({
	isBusy,
	enableBratSync,
	onEnableBratSyncChange,
	enableBratSyncHint,
}: SharedIntegrationsTabProps): JSX.Element {
	return (
		<ToggleSettingsBox
			checked={enableBratSync}
			description="Automatically synchronize plugins registered in Obsidian42 BRAT into Canary Edge."
			globalHint={enableBratSyncHint}
			icon="refresh-cw"
			iconVariant="cyan"
			isDisabled={isBusy}
			title="Obsidian42 BRAT Synchronization"
			onChange={onEnableBratSyncChange}
		/>
	);
}

export interface SharedUpdateRulesTabProps {
	readonly isBusy: boolean;
	readonly isFrozen?: boolean | undefined;
	readonly releaseChannel: ReleaseChannel;
	readonly onReleaseChannelChange: (v: ReleaseChannel) => void;
	readonly releaseChannelHint?: ReactNode | undefined;
}

export function SharedUpdateRulesTab({
	isBusy,
	isFrozen,
	releaseChannel,
	onReleaseChannelChange,
	releaseChannelHint,
}: SharedUpdateRulesTabProps): JSX.Element {
	const frozenState = isFrozen ?? false;

	return (
		<>
			<SettingsBox
				control={
					<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
						<LazyReleaseChannelDropdown
							disabled={isBusy}
							value={releaseChannel}
							onChange={onReleaseChannelChange}
						/>
					</Suspense>
				}
				description="Select which release channel to track for updates."
				globalHint={releaseChannelHint}
				icon="git-branch"
				iconVariant="purple"
				isDisabled={isBusy}
				title="Release Channel"
			/>
			{frozenState ? (
				<div className="ce-settings-note">
					Note: Update rules are ignored while the plugin is frozen.
				</div>
			) : null}
		</>
	);
}

export interface SharedAutomationTabProps {
	readonly isBusy: boolean;
	readonly checkOnLoad: UpdateCheckOnLoadConfig;
	readonly onCheckOnLoadEnabledChange: (v: boolean) => void;
	readonly onCheckOnLoadAutoDownloadChange: (v: boolean) => void;
	readonly checkOnLoadHint?: ReactNode | undefined;
	readonly checkOnLoadAutoDownloadHint?: ReactNode | undefined;

	readonly updateInterval: UpdateIntervalConfig;
	readonly onUpdateIntervalValueChange: (v: string | false) => void;
	readonly onUpdateIntervalAutoDownloadChange: (v: boolean) => void;
	readonly updateIntervalHint?: ReactNode | undefined;
	readonly updateIntervalAutoDownloadHint?: ReactNode | undefined;
	readonly sliderHint?: ReactNode | undefined;
}

export function SharedAutomationTab({
	isBusy,
	checkOnLoad,
	onCheckOnLoadEnabledChange,
	onCheckOnLoadAutoDownloadChange,
	checkOnLoadHint,
	checkOnLoadAutoDownloadHint,
	updateInterval,
	onUpdateIntervalValueChange,
	onUpdateIntervalAutoDownloadChange,
	updateIntervalHint,
	updateIntervalAutoDownloadHint,
	sliderHint,
}: SharedAutomationTabProps): JSX.Element {
	const effectiveIntervalMinutes = parseDurationToMinutes(updateInterval.value);

	return (
		<>
			<ToggleSettingsBox
				checked={checkOnLoad.enabled}
				description="Check for updates for plugins when CE loads."
				globalHint={checkOnLoadHint}
				icon="refresh-cw"
				iconVariant="purple"
				isDisabled={isBusy}
				title="Check for updates on load"
				onChange={onCheckOnLoadEnabledChange}
			/>
			{checkOnLoad.enabled ? (
				<ToggleSettingsBox
					checked={checkOnLoad.autoDownload}
					description="Automatically download and install updates found when CE loads. If disabled, only notifies of detected updates."
					globalHint={checkOnLoadAutoDownloadHint}
					icon="download"
					iconVariant="blue"
					isDisabled={isBusy}
					title="Auto-download on load"
					onChange={onCheckOnLoadAutoDownloadChange}
				/>
			) : null}
			<ToggleSettingsBox
				checked={updateInterval.value !== false}
				description="Enable a specific minimum wait time before checking for updates."
				globalHint={updateIntervalHint}
				icon="timer"
				iconVariant="orange"
				isDisabled={isBusy}
				title="Update check interval"
				onChange={(v: boolean): void => {
					onUpdateIntervalValueChange(v ? "24h" : false);
				}}
			/>
			{updateInterval.value !== false ? (
				<>
					<SettingsBox
						control={
							<Slider
								className="ce-full-width-slider"
								disabled={isBusy}
								max={MAX_MINUTES}
								min={MIN_MINUTES}
								step={60}
								value={effectiveIntervalMinutes}
								onChange={(v: number): void => {
									if (!isBusy) {
										const duration = formatMinutesToDuration(v);
										onUpdateIntervalValueChange(duration !== false ? duration : false);
									}
								}}
							/>
						}
						description="Adjust the minimum wait time between update checks."
						globalHint={sliderHint}
						icon="clock"
						iconVariant="blue"
						isDisabled={isBusy}
						title={`Interval: ${formatDuration(effectiveIntervalMinutes)}`}
					/>
					<ToggleSettingsBox
						checked={updateInterval.autoDownload}
						description="Automatically download and install updates found during interval checks. If disabled, only notifies of detected updates."
						globalHint={updateIntervalAutoDownloadHint}
						icon="download"
						iconVariant="cyan"
						isDisabled={isBusy}
						title="Auto-download on interval"
						onChange={onUpdateIntervalAutoDownloadChange}
					/>
				</>
			) : null}
		</>
	);
}
