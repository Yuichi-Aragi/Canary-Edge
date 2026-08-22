import { memo, useCallback, Suspense } from "react";
import type { JSX, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import {
	Root as DropdownMenuRoot,
	Trigger as DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { match } from "ts-pattern";
import { cva } from "class-variance-authority";

import { Button } from "@/ui/components/BaseComponents";
import { Icon } from "@/ui/components/Icon";
import { StateContainer } from "@/ui/components/StateContainer";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { usePluginCardViewModel } from "@/ui/hooks/usePluginCardViewModel";
import { useDropdownOpenState } from "@/ui/hooks/useDropdownOpenState";
import { useLongPress } from "@/ui/hooks/useLongPress";
import { useClipboard } from "@/ui/hooks/useClipboard";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { PluginConfig, OperationState } from "@/domain/types";
import type {
	PluginCardViewState,
	PluginCardViewActions,
	PluginCardOverrideData,
} from "@/ui/hooks/usePluginCardViewModel";
import type { ActiveInstallOperation } from "@/ui/hooks/useMutationTracker";
import type {
	TitleMenuContentProps,
	UpdateMenuContentProps,
	BellMenuContentProps,
} from "@/ui/components/PluginCardMenuContents";

const LONG_PRESS_DELAY_MS = 500;

const LazyTitleMenuContent = lazyWithPreload<TitleMenuContentProps>(async () => {
	const mod = await import("./PluginCardMenuContents");
	return { default: mod.TitleMenuContent };
});

const LazyUpdateMenuContent = lazyWithPreload<UpdateMenuContentProps>(async () => {
	const mod = await import("./PluginCardMenuContents");
	return { default: mod.UpdateMenuContent };
});

const LazyBellMenuContent = lazyWithPreload<BellMenuContentProps>(async () => {
	const mod = await import("./PluginCardMenuContents");
	return { default: mod.BellMenuContent };
});

interface PluginCardViewProps {
	readonly repo: string;
	readonly operation?: OperationState | undefined;
	readonly hideActions?: boolean | undefined;
	readonly state: PluginCardViewState;
	readonly actions: PluginCardViewActions;
	readonly activeDropdownId?: string | null | undefined;
	readonly onOpenDropdown?: ((id: string | null) => void) | undefined;
	readonly isScrolling?: boolean | undefined;
}

const tagVariants = cva("ce-tag", {
	variants: {
		isFrozen: {
			true: "mod-frozen",
			false: "mod-version",
		},
	},
	defaultVariants: {
		isFrozen: false,
	},
});

const PluginCardView = memo((props: PluginCardViewProps): JSX.Element => {
	const { repo, operation, hideActions, state, actions, activeDropdownId, onOpenDropdown, isScrolling } = props;
	const shouldHideActions = hideActions ?? false;
	const isScrollActive = isScrolling ?? false;

	const { copy: copyToClipboard } = useClipboard();

	const titleMenuId = `${repo}-title`;
	const updateMenuId = `${repo}-update`;
	const bellMenuId = `${repo}-bell`;

	const { isOpen: isTitleMenuOpen, handleOpenChange: rawHandleTitleOpenChange } = useDropdownOpenState({
		menuId: titleMenuId,
		isScrolling: isScrollActive,
		activeDropdownId,
		onOpenDropdown,
	});

	const { isOpen: isUpdateMenuOpen, handleOpenChange: rawHandleUpdateOpenChange } = useDropdownOpenState({
		menuId: updateMenuId,
		isScrolling: isScrollActive,
		activeDropdownId,
		onOpenDropdown,
	});

	const { isOpen: isBellMenuOpen, handleOpenChange: rawHandleBellOpenChange } = useDropdownOpenState({
		menuId: bellMenuId,
		isScrolling: isScrollActive,
		activeDropdownId,
		onOpenDropdown,
	});

	const handlePreloadMenus = useCallback((): void => {
		if (state.isUntracked) {
			return;
		}
		void LazyTitleMenuContent.preload();
		void LazyUpdateMenuContent.preload();
		void LazyBellMenuContent.preload();
	}, [state.isUntracked]);

	const handleTitleOpenChange = useCallback(
		(nextOpen: boolean): void => {
			if (state.isUntracked || (nextOpen && (isScrollActive || state.isBusy))) {
				return;
			}
			rawHandleTitleOpenChange(nextOpen);
		},
		[state.isUntracked, isScrollActive, state.isBusy, rawHandleTitleOpenChange],
	);

	const handleUpdateOpenChange = useCallback(
		(nextOpen: boolean): void => {
			if (state.isUntracked || (nextOpen && (isScrollActive || state.isBusy))) {
				return;
			}
			rawHandleUpdateOpenChange(nextOpen);
		},
		[state.isUntracked, isScrollActive, state.isBusy, rawHandleUpdateOpenChange],
	);

	const handleBellOpenChange = useCallback(
		(nextOpen: boolean): void => {
			if (state.isUntracked || (nextOpen && (isScrollActive || state.isBusy))) {
				return;
			}
			rawHandleBellOpenChange(nextOpen);
		},
		[state.isUntracked, isScrollActive, state.isBusy, rawHandleBellOpenChange],
	);

	const handleTitleLongPress = useCallback(
		(e: ReactPointerEvent<HTMLElement>): void => {
			if (state.isUntracked || isScrollActive || state.isBusy) {
				return;
			}
			e.preventDefault();
			if (onOpenDropdown !== undefined) {
				onOpenDropdown(titleMenuId);
			}
		},
		[state.isUntracked, isScrollActive, state.isBusy, onOpenDropdown, titleMenuId],
	);

	const handleTitleContextMenu = useCallback(
		(e: ReactMouseEvent<HTMLElement>): void => {
			if (state.isUntracked || isScrollActive || state.isBusy) {
				return;
			}
			e.preventDefault();
			if (onOpenDropdown !== undefined) {
				onOpenDropdown(titleMenuId);
			}
		},
		[state.isUntracked, isScrollActive, state.isBusy, onOpenDropdown, titleMenuId],
	);

	const titleLongPress = useLongPress({
		delay: LONG_PRESS_DELAY_MS,
		onLongPress: handleTitleLongPress,
	});

	const handleTitlePointerDown = useCallback(
		(e: ReactPointerEvent<HTMLElement>): void => {
			if (state.isUntracked || isScrollActive || state.isBusy) {
				return;
			}
			void LazyTitleMenuContent.preload();
			titleLongPress.onPointerDown(e);
		},
		[state.isUntracked, isScrollActive, state.isBusy, titleLongPress],
	);

	const openGitHubLink = useCallback(
		(subPath = ""): void => {
			window.open(`https://github.com/${repo}${subPath}`, "_blank", "noopener,noreferrer");
		},
		[repo],
	);

	const handleCopyUrl = useCallback((): void => {
		copyToClipboard(`https://github.com/${repo}`, { label: "Repository URL" });
	}, [copyToClipboard, repo]);

	const handleViewRepo = useCallback((): void => {
		openGitHubLink();
	}, [openGitHubLink]);

	const handleViewIssues = useCallback((): void => {
		openGitHubLink("/issues");
	}, [openGitHubLink]);

	const handleFeatureRequest = useCallback((): void => {
		openGitHubLink("/issues/new");
	}, [openGitHubLink]);

	const handleTriggerUpdate = useCallback((): void => {
		actions.handleUpdateClick(false);
	}, [actions]);

	const handleTriggerCheckUpdate = useCallback((): void => {
		actions.handleUpdateClick(true);
	}, [actions]);

	const handleSettingsLongPress = useCallback(
		(e: ReactPointerEvent<HTMLElement>): void => {
			if (isScrollActive || state.isBusy) {
				return;
			}
			e.preventDefault();
			actions.handleResetSettings();
		},
		[actions, isScrollActive, state.isBusy],
	);

	const handleSettingsClick = useCallback((): void => {
		if (isScrollActive || state.isBusy) {
			return;
		}
		actions.handleSettingsClick();
	}, [actions, isScrollActive, state.isBusy]);

	const settingsLongPress = useLongPress({
		delay: LONG_PRESS_DELAY_MS,
		onLongPress: handleSettingsLongPress,
		onClick: handleSettingsClick,
	});

	if (state.isLoading) {
		return (
			<div className="ce-dashboard-card mod-state-card">
				<StateContainer
					className="ce-card-state-container"
					message={state.loadingMessage ?? "Loading plugin details..."}
					type="loading"
				/>
			</div>
		);
	}

	if (state.isError) {
		return (
			<div className="ce-dashboard-card mod-state-card">
				<StateContainer
					className="ce-card-state-container"
					message={state.errorMessage ?? "Failed to load plugin information."}
					title="Failed to Load"
					type="error"
					onRetry={actions.handleRetry}
				/>
			</div>
		);
	}

	return (
		<div className="ce-dashboard-card" onPointerEnter={handlePreloadMenus}>
			<div className="ce-card-header">
				<div className="ce-card-title">
					{state.isUntracked ? (
						<span className="ce-card-title-untracked" title="Untracked local plugin">
							{state.pluginDisplayName}
						</span>
					) : (
						<DropdownMenuRoot open={isTitleMenuOpen} onOpenChange={handleTitleOpenChange}>
							<DropdownMenuTrigger asChild>
								<a
									href={`https://github.com/${repo}`}
									rel="noopener noreferrer"
									target="_blank"
									title={repo}
									onClick={(e: ReactMouseEvent<HTMLAnchorElement>): void => {
										e.stopPropagation();
									}}
									onContextMenu={handleTitleContextMenu}
									onFocus={(): void => {
										void LazyTitleMenuContent.preload();
									}}
									onPointerDown={handleTitlePointerDown}
									onPointerEnter={(): void => {
										void LazyTitleMenuContent.preload();
									}}
									onPointerLeave={titleLongPress.onPointerLeave}
									onPointerUp={titleLongPress.onPointerUp}
								>
									{state.pluginDisplayName}
								</a>
							</DropdownMenuTrigger>
							{isTitleMenuOpen ? (
								<Suspense fallback={null}>
									<LazyTitleMenuContent
										isUntracked={false}
										onCopyUrl={handleCopyUrl}
										onFeatureRequest={handleFeatureRequest}
										onRegisterUntracked={actions.handleRegisterUntracked}
										onViewIssues={handleViewIssues}
										onViewRepo={handleViewRepo}
									/>
								</Suspense>
							) : null}
						</DropdownMenuRoot>
					)}
				</div>
				<div className="ce-card-status-tags">
					<span className={tagVariants({ isFrozen: state.isFrozen })}>
						{state.manifestVersion}
					</span>
					{state.isIncompatible ? (
						<span className="ce-tag mod-error">Incompatible</span>
					) : null}
					{state.installStatus === "error" ? (
						<span className="ce-tag mod-error">Failed</span>
					) : null}
				</div>
			</div>

			<div className="ce-card-description">
				{state.manifestDescription}
			</div>

			<div className="ce-card-meta">
				{state.manifestAuthor !== undefined ? (
					<div className="ce-card-stat mod-author">
						<span>by {state.manifestAuthor}</span>
					</div>
				) : null}
			</div>

			{!shouldHideActions ? (
				<div className="ce-card-footer">
					<div className="ce-card-footer-left">
						{state.isUntracked
							? null
							: match({
									isInstalling: state.isInstalling,
									hasActiveOperation: state.hasActiveOperation,
									installStatus: state.installStatus,
									hasUpdates: state.detectedUpdates.length > 0,
								})
									.with({ isInstalling: true, hasActiveOperation: true }, (): JSX.Element => (
										<div className="ce-install-status is-pending">
											<span>
												{operation?.step !== undefined && operation.step !== "" ? `${operation.step}: ` : "Installing: "}
												{operation?.message ?? "Processing..."}
											</span>
										</div>
									))
									.with({ isInstalling: true, installStatus: "error" }, (): JSX.Element => (
										<div className="ce-install-status mod-error">
											<Icon className="ce-error-icon-sm" name="alert-triangle" />
											<span title={state.installErrorMessage ?? "Installation failed"}>
												{state.installErrorMessage ?? "Installation failed"}
											</span>
										</div>
									))
									.with({ isInstalling: false, hasActiveOperation: true }, (): JSX.Element => (
										<div className="ce-install-status is-pending">
											<span>
												{operation?.step !== undefined && operation.step !== "" ? `${operation.step}: ` : "Working: "}
												{operation?.message ?? "Processing..."}
											</span>
										</div>
									))
									.with({ hasUpdates: true }, (): JSX.Element => (
										<DropdownMenuRoot open={isBellMenuOpen} onOpenChange={handleBellOpenChange}>
											<DropdownMenuTrigger asChild>
												<div
													className="ce-bell-button-wrapper"
													onFocus={(): void => {
														void LazyBellMenuContent.preload();
													}}
													onPointerDown={(): void => {
														void LazyBellMenuContent.preload();
													}}
													onPointerEnter={(): void => {
														void LazyBellMenuContent.preload();
													}}
												>
													<Button
														className="ce-icon-button"
														disabled={state.isBusy || isScrollActive}
														icon="bell"
														text=""
														title={`Detected Updates (${String(state.detectedUpdates.length)})`}
													/>
													<span className="ce-bell-badge">
														{String(state.detectedUpdates.length)}
													</span>
												</div>
											</DropdownMenuTrigger>
											{isBellMenuOpen ? (
												<Suspense fallback={null}>
													<LazyBellMenuContent
														detectedUpdates={state.detectedUpdates}
														onSelectVersion={actions.handleSelectDetectedUpdate}
													/>
												</Suspense>
											) : null}
										</DropdownMenuRoot>
									))
									.otherwise((): null => null)}
					</div>
					<div className="ce-card-footer-right">
						{match({
							isUntracked: state.isUntracked,
							isInstalling: state.isInstalling,
							hasActiveOperation: state.hasActiveOperation,
						})
							.with({ isUntracked: true }, (): JSX.Element => (
								<Button
									className="ce-icon-button"
									disabled={state.isBusy || isScrollActive}
									icon="plus"
									text=""
									title="Register and Track"
									onClick={actions.handleRegisterUntracked}
								/>
							))
							.with({ isInstalling: true, hasActiveOperation: true }, (): JSX.Element => (
								<>
									<Button
										className="ce-icon-button"
										disabled={isScrollActive}
										icon="x"
										text=""
										title="Stop Installation"
										variant="destructive"
										onClick={actions.handleCancelOperation}
									/>
									<Button
										className="ce-icon-button"
										disabled={isScrollActive}
										icon="trash"
										text=""
										title="Discard Installation"
										variant="warning"
										onClick={actions.handleDiscardInstall}
									/>
								</>
							))
							.with({ isInstalling: true, hasActiveOperation: false }, (): JSX.Element => (
								<>
									<Button
										className="ce-icon-button"
										disabled={isScrollActive}
										icon="refresh-cw"
										text=""
										title="Retry Installation"
										onClick={actions.handleRetryInstall}
									/>
									<Button
										className="ce-icon-button"
										disabled={isScrollActive}
										icon="trash"
										text=""
										title="Discard Installation"
										variant="destructive"
										onClick={actions.handleDiscardInstall}
									/>
								</>
							))
							.with({ isInstalling: false, hasActiveOperation: true }, (): JSX.Element => (
								<Button
									className="ce-icon-button"
									disabled={isScrollActive}
									icon="x"
									text=""
									title="Cancel Operation"
									variant="destructive"
									onClick={actions.handleCancelOperation}
								/>
							))
							.otherwise((): JSX.Element => (
								<>
									{!state.isFrozen ? (
										<DropdownMenuRoot open={isUpdateMenuOpen} onOpenChange={handleUpdateOpenChange}>
											<DropdownMenuTrigger asChild>
												<Button
													className="ce-icon-button"
													disabled={state.isBusy || isScrollActive}
													icon="sync"
													text=""
													title="Update Options"
													onFocus={(): void => {
														void LazyUpdateMenuContent.preload();
													}}
													onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>): void => {
														if (isScrollActive || state.isBusy) {
															e.preventDefault();
														}
														void LazyUpdateMenuContent.preload();
													}}
													onPointerEnter={(): void => {
														void LazyUpdateMenuContent.preload();
													}}
												/>
											</DropdownMenuTrigger>
											{isUpdateMenuOpen ? (
												<Suspense fallback={null}>
													<LazyUpdateMenuContent
														onTriggerCheckUpdate={handleTriggerCheckUpdate}
														onTriggerUpdate={handleTriggerUpdate}
													/>
												</Suspense>
											) : null}
										</DropdownMenuRoot>
									) : null}
									<Button
										className="ce-icon-button"
										disabled={state.isBusy || isScrollActive}
										icon="settings"
										text=""
										title="Plugin Settings (Hold to Reset)"
										{...settingsLongPress}
									/>
									<Button
										className="ce-icon-button"
										disabled={state.isBusy || isScrollActive}
										icon="trash"
										text=""
										title="Unregister Plugin"
										variant="warning"
										onClick={actions.handleDeleteClick}
									/>
								</>
							))}
					</div>
				</div>
			) : null}
		</div>
	);
});
PluginCardView.displayName = "PluginCardView";

export interface PluginCardProps {
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
	readonly hideActions?: boolean | undefined;
	readonly index?: number | undefined;
	readonly isScrolling?: boolean | undefined;
	readonly overrideData?: PluginCardOverrideData | undefined;
	readonly activeDropdownId?: string | null | undefined;
	readonly onOpenDropdown?: ((id: string | null) => void) | undefined;
}

export const PluginCard = memo((props: PluginCardProps): JSX.Element => {
	const vm = usePluginCardViewModel(props);

	return (
		<CanaryErrorBoundary variant="card">
			<PluginCardView
				actions={vm.actions}
				activeDropdownId={props.activeDropdownId}
				hideActions={props.hideActions}
				isScrolling={props.isScrolling}
				onOpenDropdown={props.onOpenDropdown}
				operation={props.operation}
				repo={props.repo}
				state={vm.state}
			/>
		</CanaryErrorBoundary>
	);
});
PluginCard.displayName = "PluginCard";
