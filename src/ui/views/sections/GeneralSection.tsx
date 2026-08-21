import { useMemo, type JSX } from "react";

import { useGeneralViewModel, type GeneralViewState, type GeneralViewActions } from "@/ui/hooks/useGeneralViewModel";
import { CEHeader, type Section } from "@/ui/components/CEHeader";
import { RateLimitDashboard } from "@/ui/components/RateLimitDashboard";
import { CategorySelector } from "@/ui/components/CategorySelector";
import { SecretSelector } from "@/ui/components/SecretSelector";
import { SettingsBox } from "@/ui/components/SettingsBox";
import { SharedGeneralTab, SharedUpdateRulesTab, SharedAutomationTab, SharedIntegrationsTab } from "@/ui/components/SharedSettingsTabs";

import type { GeneralCategory } from "@/ui/hooks/useGeneralViewModel";
import type {
	ChangelogPriority,
	ReleaseChannel,
	ShowChangelogConfig,
	ShowChangelogMode,
	UpdateCheckOnLoadConfig,
	UpdateIntervalConfig,
} from "@/domain/types";

const GENERAL_CATEGORIES: readonly GeneralCategory[] = [
	"Installation",
	"Update Rules",
	"Automation",
	"Integrations",
] as const;

interface GlobalSettingsWrapper {
	readonly config: {
		readonly autoEnable: boolean;
		readonly showChangelog: ShowChangelogConfig;
		readonly tokenSecretId: string | false;
		readonly updateInterval: UpdateIntervalConfig;
		readonly releaseChannel: ReleaseChannel;
		readonly updateCheckOnLoad: UpdateCheckOnLoadConfig;
		readonly forceInstall: {
			readonly version: boolean;
			readonly platform: boolean;
		};
		readonly enableBratSync: boolean;
	};
}

interface InstallationTabContainerProps {
	readonly settings: GlobalSettingsWrapper;
	readonly isBusy: boolean;
	readonly updateAutoEnable: (value: boolean) => void;
	readonly updateShowChangelogMode: (value: ShowChangelogMode) => void;
	readonly updateChangelogPriority: (value: ChangelogPriority) => void;
	readonly updateForceInstall: (key: "version" | "platform", value: boolean) => void;
}

function InstallationTabContainer({
	settings,
	isBusy,
	updateAutoEnable,
	updateShowChangelogMode,
	updateChangelogPriority,
	updateForceInstall,
}: InstallationTabContainerProps): JSX.Element {
	return (
		<SharedGeneralTab
			autoEnable={settings.config.autoEnable}
			forcePlatform={settings.config.forceInstall.platform}
			forceVersion={settings.config.forceInstall.version}
			isBusy={isBusy}
			showChangelog={settings.config.showChangelog}
			onAutoEnableChange={updateAutoEnable}
			onChangelogPriorityChange={updateChangelogPriority}
			onForcePlatformChange={(v: boolean): void => {
				updateForceInstall("platform", v);
			}}
			onForceVersionChange={(v: boolean): void => {
				updateForceInstall("version", v);
			}}
			onShowChangelogModeChange={updateShowChangelogMode}
		/>
	);
}

interface IntegrationsTabContainerProps {
	readonly settings: GlobalSettingsWrapper;
	readonly isBusy: boolean;
	readonly updateEnableBratSync: (value: boolean) => void;
}

function IntegrationsTabContainer({
	settings,
	isBusy,
	updateEnableBratSync,
}: IntegrationsTabContainerProps): JSX.Element {
	return (
		<SharedIntegrationsTab
			enableBratSync={settings.config.enableBratSync}
			isBusy={isBusy}
			onEnableBratSyncChange={updateEnableBratSync}
		/>
	);
}

interface UpdateRulesTabContainerProps {
	readonly settings: GlobalSettingsWrapper;
	readonly isBusy: boolean;
	readonly updateReleaseChannel: (value: ReleaseChannel) => void;
}

function UpdateRulesTabContainer({
	settings,
	isBusy,
	updateReleaseChannel,
}: UpdateRulesTabContainerProps): JSX.Element {
	return (
		<SharedUpdateRulesTab
			isBusy={isBusy}
			releaseChannel={settings.config.releaseChannel}
			onReleaseChannelChange={updateReleaseChannel}
		/>
	);
}

interface AutomationTabContainerProps {
	readonly settings: GlobalSettingsWrapper;
	readonly isBusy: boolean;
	readonly updateIntervalValue: (value: string | false) => void;
	readonly updateIntervalAutoDownload: (value: boolean) => void;
	readonly updateCheckOnLoadEnabled: (value: boolean) => void;
	readonly updateCheckOnLoadAutoDownload: (value: boolean) => void;
}

function AutomationTabContainer({
	settings,
	isBusy,
	updateIntervalValue,
	updateIntervalAutoDownload,
	updateCheckOnLoadEnabled,
	updateCheckOnLoadAutoDownload,
}: AutomationTabContainerProps): JSX.Element {
	return (
		<SharedAutomationTab
			checkOnLoad={settings.config.updateCheckOnLoad}
			isBusy={isBusy}
			updateInterval={settings.config.updateInterval}
			onCheckOnLoadAutoDownloadChange={updateCheckOnLoadAutoDownload}
			onCheckOnLoadEnabledChange={updateCheckOnLoadEnabled}
			onUpdateIntervalAutoDownloadChange={updateIntervalAutoDownload}
			onUpdateIntervalValueChange={updateIntervalValue}
		/>
	);
}

interface GeneralSectionViewProps {
	readonly state: GeneralViewState;
	readonly actions: GeneralViewActions;
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

function GeneralSectionView({
	state,
	actions,
	activeSection,
	onSectionChange,
}: GeneralSectionViewProps): JSX.Element {
	const wrappedSettings = useMemo((): GlobalSettingsWrapper => {
		return { config: state.settings.global };
	}, [state.settings.global]);

	const secretStrings = useMemo((): readonly string[] => {
		return state.secretOptions
			.map((opt: { readonly label: string; readonly value: string }): string => opt.value)
			.filter((val: string): boolean => val !== "");
	}, [state.secretOptions]);

	const tabpanelId = `general-tabpanel-${state.activeCategory.toLowerCase().replace(/\s+/g, "-")}`;
	const tabId = `general-tab-${state.activeCategory.toLowerCase().replace(/\s+/g, "-")}`;

	return (
		<div className="ce-dashboard">
			<CEHeader activeSection={activeSection} onSectionChange={onSectionChange} />

			<div className="ce-section-scrollable">
				<div className="ce-dashboard-wrapper mod-top">
					<RateLimitDashboard tokenSecretId={state.currentSecretId} />
				</div>

				<CategorySelector
					activeCategory={state.activeCategory}
					categories={GENERAL_CATEGORIES}
					isDisabled={state.isPending}
					onCategoryChange={actions.setActiveCategory}
				/>

				<div
					aria-labelledby={tabId}
					className="ce-category-content-area"
					id={tabpanelId}
					role="tabpanel"
				>
					{state.activeCategory === "Installation" ? (
						<InstallationTabContainer
							isBusy={state.isPending}
							settings={wrappedSettings}
							updateAutoEnable={actions.updateAutoEnable}
							updateChangelogPriority={actions.updateChangelogPriority}
							updateForceInstall={actions.updateForceInstall}
							updateShowChangelogMode={actions.updateShowChangelogMode}
						/>
					) : null}

					{state.activeCategory === "Integrations" ? (
						<IntegrationsTabContainer
							isBusy={state.isPending}
							settings={wrappedSettings}
							updateEnableBratSync={actions.updateEnableBratSync}
						/>
					) : null}

					{state.activeCategory === "Update Rules" ? (
						<UpdateRulesTabContainer
							isBusy={state.isPending}
							settings={wrappedSettings}
							updateReleaseChannel={actions.updateReleaseChannel}
						/>
					) : null}

					{state.activeCategory === "Automation" ? (
						<AutomationTabContainer
							isBusy={state.isPending}
							settings={wrappedSettings}
							updateCheckOnLoadAutoDownload={actions.updateCheckOnLoadAutoDownload}
							updateCheckOnLoadEnabled={actions.updateCheckOnLoadEnabled}
							updateIntervalAutoDownload={actions.updateIntervalAutoDownload}
							updateIntervalValue={actions.updateIntervalValue}
						/>
					) : null}
				</div>

				<hr className="ce-settings-divider" />

				<SettingsBox
					control={
						<SecretSelector
							isValidating={state.isValidatingToken}
							options={secretStrings}
							value={state.currentSecretId}
							onChange={actions.updateTokenSecretId}
						/>
					}
					description={
						<>
							Select a secret containing your GitHub PAT.
							<br />
							<span className="ce-note">Secrets must be created in Obsidian Settings &gt; Secrets.</span>
						</>
					}
					icon="key"
					iconVariant="yellow"
					isDisabled={state.isPending}
					title="Personal access token (Secret)"
				/>
			</div>
		</div>
	);
}

export interface GeneralSectionProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

export function GeneralSection({ activeSection, onSectionChange }: GeneralSectionProps): JSX.Element {
	const vm = useGeneralViewModel();
	return (
		<GeneralSectionView
			actions={vm.actions}
			activeSection={activeSection}
			onSectionChange={onSectionChange}
			state={vm.state}
		/>
	);
}
