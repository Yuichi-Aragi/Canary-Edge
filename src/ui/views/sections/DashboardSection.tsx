import { useCallback, memo, lazy, Suspense, type JSX } from "react";
import { Virtuoso } from "react-virtuoso";
import { clsx } from "clsx";

import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { CEHeader } from "@/ui/components/CEHeader";
import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";
import { PluginCard } from "@/ui/components/PluginCard";
import { StateContainer } from "@/ui/components/StateContainer";
import { useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useCommunityPluginsSync } from "@/ui/hooks/useCommunityPlugins";
import { useDashboardViewModel } from "@/ui/hooks/useDashboardViewModel";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { DashboardFilterType, PluginConfig } from "@/domain/types";
import type { Section } from "@/ui/components/CEHeader";
import type { DashboardViewState, DashboardViewActions } from "@/ui/hooks/useDashboardViewModel";
import type { ActiveInstallOperation } from "@/ui/hooks/useMutationTracker";

interface DashboardFilterDropdownProps {
	readonly activeDropdownId: string | null;
	readonly activeFilters: ReadonlySet<DashboardFilterType>;
	readonly hasActiveInstallations: boolean;
	readonly isScrolling: boolean;
	readonly onOpenDropdown: (id: string | null) => void;
	readonly onToggleFilter: (filter: DashboardFilterType) => void;
}

const LazyDashboardFilterDropdown = lazyWithPreload<DashboardFilterDropdownProps>(async () => {
	const mod = await import("@/ui/components/DashboardFilterDropdown");
	return { default: mod.DashboardFilterDropdown };
});

const LazyPluginSettingsPanel = lazy(async () => {
	const mod = await import("@/ui/components/PluginSettingsPanel");
	return { default: mod.PluginSettingsPanel };
});

interface DashboardRowContainerProps {
	readonly repo: string;
	readonly index: number;
	readonly isScrolling: boolean;
	readonly activeDropdownId: string | null;
	readonly activeInstallation?: ActiveInstallOperation | undefined;
	readonly onOpenDropdown: (id: string | null) => void;
	readonly onSettings: (repo: string, data?: PluginConfig) => void;
	readonly onRetryInstall?: ((activeOp: ActiveInstallOperation) => void) | undefined;
	readonly onDiscardInstall?: ((activeOp: ActiveInstallOperation) => void) | undefined;
	readonly onCancelInstall?: ((repo: string) => void) | undefined;
}

const DashboardRowContainer = memo(
	({
		repo,
		index,
		isScrolling,
		activeDropdownId,
		activeInstallation,
		onOpenDropdown,
		onSettings,
		onRetryInstall,
		onDiscardInstall,
		onCancelInstall,
	}: DashboardRowContainerProps): JSX.Element => {
		const frozenData = useCanaryState((storeState) => {
			return storeState.settings.plugins[repo];
		});
		const operation = useCanaryState((storeState) => {
			return storeState.runtime.operations[repo];
		});

		const isRowDropdownActive = activeDropdownId?.startsWith(`${repo}-`) === true;
		const rowActiveDropdownId = isRowDropdownActive ? activeDropdownId : null;

		return (
			<CanaryErrorBoundary variant="card">
				<PluginCard
					activeDropdownId={rowActiveDropdownId}
					activeInstallation={activeInstallation}
					frozenData={frozenData}
					index={index}
					isScrolling={isScrolling}
					operation={operation}
					repo={repo}
					onCancelInstall={onCancelInstall}
					onDiscardInstall={onDiscardInstall}
					onOpenDropdown={onOpenDropdown}
					onRetryInstall={onRetryInstall}
					onSettings={onSettings}
				/>
			</CanaryErrorBoundary>
		);
	},
);
DashboardRowContainer.displayName = "DashboardRowContainer";

interface DashboardSectionViewProps {
	readonly state: DashboardViewState;
	readonly actions: DashboardViewActions;
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

function DashboardSectionView({
	state,
	actions,
	activeSection,
	onSectionChange,
}: DashboardSectionViewProps): JSX.Element {
	const renderItemContent = useCallback(
		(index: number, repo: string): JSX.Element => {
			const activeInstallation = state.activeInstallationsMap.get(repo);
			return (
				<DashboardRowContainer
					activeDropdownId={state.activeDropdownId}
					activeInstallation={activeInstallation}
					index={index}
					isScrolling={state.isScrolling}
					repo={repo}
					onCancelInstall={actions.handleCancelInstall}
					onDiscardInstall={actions.handleDiscardInstall}
					onOpenDropdown={actions.handleOpenDropdown}
					onRetryInstall={actions.handleRetryInstall}
					onSettings={actions.handleSettings}
				/>
			);
		},
		[
			actions.handleCancelInstall,
			actions.handleDiscardInstall,
			actions.handleOpenDropdown,
			actions.handleRetryInstall,
			actions.handleSettings,
			state.activeDropdownId,
			state.activeInstallationsMap,
			state.isScrolling,
		],
	);

	const computeItemKey = useCallback((_index: number, item: string): string => {
		return item;
	}, []);

	const renderListContent = (): JSX.Element => {
		const hasPlugins = state.filteredPlugins.length > 0;

		if (state.isLoading && !hasPlugins) {
			let loadingTitle = "Loading Dashboard";
			let loadingMessage = "Fetching installed and tracked plugins...";

			const trimmedQuery = state.searchQuery.trim();
			if (trimmedQuery !== "") {
				loadingTitle = "Filtering Plugins";
				loadingMessage = `Filtering plugins matching "${trimmedQuery}"...`;
			} else if (state.activeFilters.size > 0) {
				loadingTitle = "Applying Filters";
				const activeList = Array.from(state.activeFilters).join(", ");
				loadingMessage = `Applying active filters (${activeList})...`;
			}

			return <StateContainer message={loadingMessage} title={loadingTitle} type="loading" />;
		}

		if (!hasPlugins && !state.isLoading) {
			const trimmedQuery = state.searchQuery.trim();
			if (state.activeFilters.has("installing")) {
				return (
					<StateContainer
						icon="check-circle"
						message={
							trimmedQuery !== ""
								? `No active installations match "${trimmedQuery}".`
								: "No ongoing or failed installations."
						}
						title={trimmedQuery !== "" ? "No Matching Installations" : "No Active Installations"}
						type="empty"
					/>
				);
			}

			return (
				<StateContainer
					icon={trimmedQuery !== "" ? "search" : "package"}
					message={
						trimmedQuery !== ""
							? `No plugins match your query "${trimmedQuery}".`
							: "No plugins added yet."
					}
					title={trimmedQuery !== "" ? "No Matching Plugins" : "Dashboard Empty"}
					type="empty"
				/>
			);
		}

		return (
			<Virtuoso
				className={clsx("ce-virtuoso-list", "ce-virtuoso-full-height", state.isScrolling ? "is-scrolling" : "")}
				computeItemKey={computeItemKey}
				data={state.filteredPlugins}
				increaseViewportBy={400}
				isScrolling={actions.setIsScrolling}
				itemContent={renderItemContent}
				overscan={{ main: 800, reverse: 800 }}
			/>
		);
	};

	return (
		<CanaryErrorBoundary>
			<div className="ce-dashboard">
				<CanaryErrorBoundary>
					<CEHeader
						activeSection={activeSection}
						info={`${String(state.filteredPlugins.length)} Plugins`}
						isSearchVisible={state.showSearch}
						searchQuery={state.searchQuery}
						actions={
							<Suspense fallback={<div className="ce-dropdown-placeholder" />}>
								<LazyDashboardFilterDropdown
									activeDropdownId={state.activeDropdownId}
									activeFilters={state.activeFilters}
									hasActiveInstallations={state.hasActiveInstallations}
									isScrolling={state.isScrolling}
									onOpenDropdown={actions.handleOpenDropdown}
									onToggleFilter={actions.toggleFilter}
								/>
							</Suspense>
						}
						onAdd={actions.handleOpenAdd}
						onSearchChange={actions.setSearchQuery}
						onSearchToggle={actions.handleSearchToggle}
						onSectionChange={onSectionChange}
					/>
				</CanaryErrorBoundary>

				<div className="ce-virtuoso-container">
					<CanaryErrorBoundary>{renderListContent()}</CanaryErrorBoundary>
				</div>

				{state.selectedSettings !== null ? (
					<LazyPanelBoundary
						loadingMessage="Initializing plugin configuration panel..."
						loadingTitle="Loading Settings"
					>
						<LazyPluginSettingsPanel
							initialData={state.selectedSettings.data}
							repo={state.selectedSettings.repo}
							onClose={actions.handleCloseSettings}
							onDelete={actions.handleDelete}
							onUpdate={actions.handleUpdate}
						/>
					</LazyPanelBoundary>
				) : null}
			</div>
		</CanaryErrorBoundary>
	);
}

interface DashboardContentProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

function DashboardContent({ activeSection, onSectionChange }: DashboardContentProps): JSX.Element {
	const vm = useDashboardViewModel();
	return (
		<DashboardSectionView
			actions={vm.actions}
			activeSection={activeSection}
			state={vm.state}
			onSectionChange={onSectionChange}
		/>
	);
}

export interface DashboardSectionProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

export function DashboardSection({ activeSection, onSectionChange }: DashboardSectionProps): JSX.Element {
	const { isReady, isError, error, retry } = useCommunityPluginsSync();

	if (!isReady) {
		if (isError) {
			return (
				<CanaryErrorBoundary>
					<div className="ce-dashboard">
						<CEHeader
							activeSection={activeSection}
							info="Sync Required"
							isSearchVisible={false}
							searchQuery=""
							onSectionChange={onSectionChange}
						/>
						<div className="ce-virtuoso-container">
							<StateContainer
								icon="alert-triangle"
								message={
									error?.message ??
									"Failed to synchronize community plugins directory. Please verify your internet connection and retry."
								}
								title="Directory Sync Failed"
								type="empty"
							/>
							<div className="ce-sync-retry-container">
								<button
									className="ce-btn ce-btn-primary mod-cta"
									type="button"
									onClick={retry}
								>
									Retry Synchronization
								</button>
							</div>
						</div>
					</div>
				</CanaryErrorBoundary>
			);
		}

		return (
			<CanaryErrorBoundary>
				<div className="ce-dashboard">
					<CEHeader
						activeSection={activeSection}
						info="Synchronizing..."
						isSearchVisible={false}
						searchQuery=""
						onSectionChange={onSectionChange}
					/>
					<div className="ce-virtuoso-container">
						<StateContainer
							message="Checking local cache and loading community plugins directory..."
							title="Synchronizing Directory"
							type="loading"
						/>
					</div>
				</div>
			</CanaryErrorBoundary>
		);
	}

	return (
		<DashboardContent
			activeSection={activeSection}
			onSectionChange={onSectionChange}
		/>
	);
}
