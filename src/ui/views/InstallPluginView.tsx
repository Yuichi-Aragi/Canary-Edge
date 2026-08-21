import { Controller, useController } from "react-hook-form";
import { lazy, type JSX } from "react";
import { match } from "ts-pattern";

import { useInstallPluginViewModel } from "@/ui/hooks/useInstallPluginViewModel";
import { Button } from "@/ui/components/BaseComponents";
import { Icon } from "@/ui/components/Icon";
import { PluginCard } from "@/ui/components/PluginCard";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { CategorySelector } from "@/ui/components/CategorySelector";
import {
	SharedGeneralTab,
	SharedUpdateRulesTab,
	SharedAutomationTab,
} from "@/ui/components/SharedSettingsTabs";
import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";

import type { Control } from "react-hook-form";
import type {
	ChangelogPriority,
	InstallPluginModalOptions,
	ShowChangelogMode,
} from "@/domain/types";
import type { InstallPluginFormData } from "@/domain/schemas";
import type {
	InstallPluginViewState,
	InstallPluginViewActions,
} from "@/ui/hooks/useInstallPluginViewModel";

const LazySharedReadmeTab = lazy(async () => {
	const mod = await import("@/ui/components/SharedReadmeTab");
	return { default: mod.SharedReadmeTab };
});

const LazyInstallPluginVersionAuthTab = lazy(async () => {
	const mod = await import("@/ui/components/InstallPluginVersionAuthTab");
	return { default: mod.InstallPluginVersionAuthTab };
});

const LazyPluginVersionChangelogPreview = lazy(async () => {
	const mod = await import("@/ui/components/PluginVersionChangelogPreview");
	return { default: mod.PluginVersionChangelogPreview };
});

interface InstallPluginGeneralTabProps {
	readonly control: Control<InstallPluginFormData>;
	readonly isVersionsSuccess: boolean;
	readonly isConflict: boolean;
}

function InstallPluginGeneralTab({
	control,
	isVersionsSuccess,
	isConflict,
}: InstallPluginGeneralTabProps): JSX.Element {
	const { field: statusField } = useController({ control, name: "status" });
	const { field: autoEnableField } = useController({ control, name: "autoEnable" });
	const { field: showChangelogField } = useController({ control, name: "showChangelog" });
	const { field: forceVersionField } = useController({ control, name: "forceInstall.version" });
	const { field: forcePlatformField } = useController({ control, name: "forceInstall.platform" });

	const isBusy = isVersionsSuccess === false || isConflict === true;

	return (
		<SharedGeneralTab
			autoEnable={autoEnableField.value}
			forcePlatform={forcePlatformField.value}
			forceVersion={forceVersionField.value}
			isBusy={isBusy}
			isFrozen={statusField.value === "frozen"}
			showChangelog={showChangelogField.value}
			onAutoEnableChange={autoEnableField.onChange}
			onChangelogPriorityChange={(priority: ChangelogPriority): void => {
				showChangelogField.onChange({
					...showChangelogField.value,
					priority,
				});
			}}
			onForcePlatformChange={forcePlatformField.onChange}
			onForceVersionChange={forceVersionField.onChange}
			onFrozenChange={(v: boolean): void => {
				statusField.onChange(v === true ? "frozen" : "active");
			}}
			onShowChangelogModeChange={(mode: ShowChangelogMode): void => {
				showChangelogField.onChange({
					...showChangelogField.value,
					mode,
				});
			}}
		/>
	);
}

interface InstallPluginUpdateRulesTabProps {
	readonly control: Control<InstallPluginFormData>;
	readonly isConflict: boolean;
	readonly isVersionsSuccess: boolean;
}

function InstallPluginUpdateRulesTab({
	control,
	isConflict,
	isVersionsSuccess,
}: InstallPluginUpdateRulesTabProps): JSX.Element {
	const { field: releaseChannelField } = useController({ control, name: "releaseChannel" });
	const { field: statusField } = useController({ control, name: "status" });

	return (
		<SharedUpdateRulesTab
			isBusy={isVersionsSuccess === false || isConflict === true}
			isFrozen={statusField.value === "frozen"}
			releaseChannel={releaseChannelField.value}
			onReleaseChannelChange={releaseChannelField.onChange}
		/>
	);
}

interface InstallPluginAutomationTabProps {
	readonly control: Control<InstallPluginFormData>;
	readonly isConflict: boolean;
}

function InstallPluginAutomationTab({
	control,
	isConflict,
}: InstallPluginAutomationTabProps): JSX.Element {
	const { field: updateCheckOnLoadField } = useController({ control, name: "updateCheckOnLoad" });
	const { field: updateIntervalField } = useController({ control, name: "updateInterval" });

	return (
		<SharedAutomationTab
			checkOnLoad={updateCheckOnLoadField.value}
			isBusy={isConflict}
			updateInterval={updateIntervalField.value}
			onCheckOnLoadAutoDownloadChange={(v: boolean): void => {
				updateCheckOnLoadField.onChange({
					...updateCheckOnLoadField.value,
					autoDownload: v,
				});
			}}
			onCheckOnLoadEnabledChange={(v: boolean): void => {
				updateCheckOnLoadField.onChange({
					...updateCheckOnLoadField.value,
					enabled: v,
				});
			}}
			onUpdateIntervalAutoDownloadChange={(v: boolean): void => {
				updateIntervalField.onChange({
					...updateIntervalField.value,
					autoDownload: v,
				});
			}}
			onUpdateIntervalValueChange={(v: string | false): void => {
				updateIntervalField.onChange({
					...updateIntervalField.value,
					value: v,
				});
			}}
		/>
	);
}

interface InstallPluginViewContentProps {
	readonly state: InstallPluginViewState;
	readonly actions: InstallPluginViewActions;
	readonly onClose: () => void;
}

function InstallPluginViewContent({ state, actions, onClose }: InstallPluginViewContentProps): JSX.Element {
	const {
		form: {
			control,
			handleSubmit,
			formState: { errors, isValid: isFormValid },
		},
		versions,
		tokenInfo,
		isVersionsSuccess,
		isPending,
		previewPlugin,
		previewVersion,
		isPreviewLoading,
		isPreviewError,
		previewErrorMessage,
		shouldShowPreviewCard,
		isConflict,
		isAlreadyTracked,
		secretOptions,
		activeCategory,
		categories,
		watchedUseToken,
		watchedRepo,
		watchedTokenId,
		watchedReleaseChannel,
		watchedShowChangelog,
	} = state;

	const {
		handleTokenValidation,
		handleRepoChange,
		handleRepoKeyDown,
		handleRetryPreview,
		onSubmit,
		setActiveCategory,
	} = actions;

	const isAddDisabled =
		isFormValid === false ||
		isVersionsSuccess === false ||
		isPending === true ||
		isConflict === true ||
		isAlreadyTracked === true;

	return (
		<>
			{shouldShowPreviewCard === true ? (
				<div className="ce-dashboard-card-wrapper mod-spaced">
					<CanaryErrorBoundary variant="card">
						<PluginCard
							hideActions
							overrideData={{
								name: previewPlugin?.name,
								version: previewVersion,
								description: previewPlugin?.description,
								author: previewPlugin?.author,
								isIncompatible: previewPlugin?.isIncompatible,
								isLoading: isPreviewLoading,
								isError: isPreviewError,
								loadingMessage: "Loading repository details...",
								errorMessage: previewErrorMessage,
								onRetry: handleRetryPreview,
							}}
							repo={watchedRepo}
							onDelete={(): void => {}}
							onSettings={(): void => {}}
							onUpdate={(): void => {}}
						/>
					</CanaryErrorBoundary>
				</div>
			) : null}

			<div className="ce-dashboard-card-wrapper mod-spaced">
				<div className="ce-input-card">
					<div className="ce-form-group">
						<Controller
							control={control}
							name="repositoryUrl"
							render={({ field }): JSX.Element => (
								<div className="ce-input-wrapper mod-search-left">
									<Icon className="ce-suggester-search-icon mod-left" name="search" />
									<input
										autoCapitalize="none"
										autoComplete="off"
										autoCorrect="off"
										className="ce-inline-input"
										disabled={isConflict === true}
										placeholder="Repository (Owner/Repo, GitHub URL, or gh:Owner/Repo)"
										spellCheck={false}
										type="text"
										value={field.value}
										onChange={(e): void => {
											handleRepoChange(e.target.value);
										}}
										onKeyDown={handleRepoKeyDown}
									/>
									{field.value !== "" ? (
										<div className="ce-suggester-input-actions">
											<button
												aria-label="Clear repository input"
												className="ce-input-clear-btn"
												tabIndex={-1}
												type="button"
												onClick={(): void => {
													handleRepoChange("");
												}}
											>
												<span className="ce-clear-icon-inner">×</span>
											</button>
										</div>
									) : null}
								</div>
							)}
						/>
					</div>
				</div>
				{errors.repositoryUrl !== undefined ? (
					<div className="ce-form-error mod-indented">{errors.repositoryUrl.message}</div>
				) : null}
			</div>

			<div className="ce-dashboard-card-wrapper mod-settings-panel">
				<form id="ce-install-plugin-form" className="ce-settings-grid" onSubmit={handleSubmit(onSubmit)}>
					<CategorySelector
						activeCategory={activeCategory}
						categories={categories}
						isDisabled={isConflict === true}
						onCategoryChange={setActiveCategory}
					/>

					<div className="ce-category-content-area">
						{match(activeCategory)
							.with("General", (): JSX.Element => (
								<InstallPluginGeneralTab
									control={control}
									isConflict={isConflict}
									isVersionsSuccess={isVersionsSuccess}
								/>
							))
							.with("Update Rules", (): JSX.Element => (
								<InstallPluginUpdateRulesTab
									control={control}
									isConflict={isConflict}
									isVersionsSuccess={isVersionsSuccess}
								/>
							))
							.with("Automation", (): JSX.Element => (
								<InstallPluginAutomationTab
									control={control}
									isConflict={isConflict}
								/>
							))
							.with("Version & Auth", (): JSX.Element => (
								<LazyPanelBoundary loadingMessage="Loading version and authentication settings...">
									<LazyInstallPluginVersionAuthTab
										channel={watchedReleaseChannel}
										control={control}
										errors={errors}
										handleTokenValidation={handleTokenValidation}
										isConflict={isConflict}
										isPending={isPending}
										isVersionsSuccess={isVersionsSuccess}
										repoUrl={watchedRepo}
										secretOptions={secretOptions}
										tokenInfo={tokenInfo}
										tokenSecretId={watchedTokenId}
										versions={versions}
										watchedUseToken={watchedUseToken}
									/>
								</LazyPanelBoundary>
							))
							.with("README", (): JSX.Element => (
								<LazyPanelBoundary loadingMessage="Loading repository README...">
									<LazySharedReadmeTab
										isEnabled={activeCategory === "README"}
										repoUrl={watchedRepo}
										tokenSecretId={watchedUseToken === true ? watchedTokenId : undefined}
									/>
								</LazyPanelBoundary>
							))
							.exhaustive()}
					</div>
				</form>
			</div>

			{activeCategory === "Version & Auth" && isVersionsSuccess === true && watchedRepo.trim() !== "" ? (
				<LazyPanelBoundary loadingMessage="Loading release changelog...">
					<LazyPluginVersionChangelogPreview
						hideCard
						channel={watchedReleaseChannel}
						priority={watchedShowChangelog.priority}
						repoUrl={watchedRepo}
						tokenSecretId={watchedUseToken === true ? watchedTokenId : undefined}
						version={previewVersion}
					/>
				</LazyPanelBoundary>
			) : null}

			<div className="ce-dashboard-card-wrapper mod-settings-panel">
				<div className="ce-install-actions-card">
					<div className="ce-install-actions-buttons">
						<Button
							text="Cancel"
							variant="default"
							onClick={onClose}
						/>
						<Button
							disabled={isAddDisabled}
							text="Install"
							variant="cta"
							onClick={handleSubmit(onSubmit)}
						/>
					</div>
				</div>
			</div>
		</>
	);
}

export interface InstallPluginViewProps {
	readonly options: InstallPluginModalOptions;
	readonly onClose: () => void;
}

export function InstallPluginView({ options, onClose }: InstallPluginViewProps): JSX.Element {
	const vm = useInstallPluginViewModel({
		prefillRepo: options.prefillRepo,
		prefillVersion: options.prefillVersion,
		prefillReleaseChannel: options.prefillReleaseChannel,
		onSuccess: options.onSuccess,
		closeModal: onClose,
	});

	return (
		<InstallPluginViewContent
			actions={vm.actions}
			onClose={onClose}
			state={vm.state}
		/>
	);
}
