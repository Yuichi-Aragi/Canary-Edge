import { useState, useCallback, useMemo } from "react";

import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useCanaryActions, useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useDashboardFilters } from "@/ui/hooks/useDashboardFilters";
import { useMutationTracker } from "@/ui/hooks/useMutationTracker";
import { usePluginOperations } from "@/ui/hooks/usePluginOperations";
import { useService } from "@/ui/hooks/useService";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";

import type { DashboardFilterType, PluginConfig } from "@/domain/types";
import type { ActiveInstallOperation } from "@/ui/hooks/useMutationTracker";

export interface DashboardViewState {
	readonly searchQuery: string;
	readonly showSearch: boolean;
	readonly activeFilters: ReadonlySet<DashboardFilterType>;
	readonly filteredPlugins: readonly string[];
	readonly activeInstallations: readonly ActiveInstallOperation[];
	readonly activeInstallationsMap: ReadonlyMap<string, ActiveInstallOperation>;
	readonly hasActiveInstallations: boolean;
	readonly selectedSettings: { readonly repo: string; readonly data: PluginConfig | undefined } | null;
	readonly isScrolling: boolean;
	readonly isPending: boolean;
	readonly isLoading: boolean;
	readonly activeDropdownId: string | null;
}

export interface DashboardViewActions {
	readonly setSearchQuery: (query: string) => void;
	readonly setShowSearch: (show: boolean) => void;
	readonly toggleFilter: (filter: DashboardFilterType) => void;
	readonly dismissMutation: (id: string) => void;
	readonly handleUpdate: (repo: string, tokenSecretId?: string) => void;
	readonly handleDelete: (repo: string) => void;
	readonly handleSettings: (repo: string, data?: PluginConfig) => void;
	readonly handleCloseSettings: () => void;
	readonly handleOpenAdd: () => void;
	readonly handleSearchToggle: () => void;
	readonly setIsScrolling: (isScrolling: boolean) => void;
	readonly handleOpenDropdown: (id: string | null) => void;
	readonly handleRetryInstall: (activeOp: ActiveInstallOperation) => void;
	readonly handleDiscardInstall: (activeOp: ActiveInstallOperation) => void;
	readonly handleCancelInstall: (repo: string) => void;
}

export interface DashboardViewModel {
	readonly state: DashboardViewState;
	readonly actions: DashboardViewActions;
}

export function useDashboardViewModel(): DashboardViewModel {
	const { isPending: isTransitionPending, runTransition } = useTransitionAction();
	
	const settings = useCanaryState((state) => {
		return state.settings;
	});
	const confirmRequest = useCanaryState((state) => {
		return state.ui.confirmRequest;
	});
	const requestInstallPlugin = useCanaryActions((actions) => {
		return actions.requestInstallPlugin;
	});
	const updateOperationState = useCanaryActions((actions) => {
		return actions.updateOperationState;
	});

	const { updatePlugin, deletePlugin, installPlugin } = usePluginOperations();
	const workflowService = useService("pluginWorkflowService");
	const tracker = useMutationTracker();
	const filters = useDashboardFilters({
		settings,
		activeInstallations: tracker.activeInstallations,
	});

	const [selectedSettings, setSelectedSettings] = useState<{
		readonly repo: string;
		readonly data: PluginConfig | undefined;
	} | null>(null);
	const [isScrolling, setIsScrolling] = useState<boolean>(false);
	const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

	const isConfirmActive = confirmRequest !== null;
	const effectiveShowSearch = isConfirmActive ? false : filters.showSearch;
	const effectiveActiveDropdownId = isConfirmActive ? null : activeDropdownId;

	const handleOpenDropdown = useCallback(
		(id: string | null): void => {
			if (isScrolling) {
				setActiveDropdownId(null);
				return;
			}
			setActiveDropdownId(id);
		},
		[isScrolling],
	);

	const handleSetIsScrolling = useCallback((scrolling: boolean): void => {
		setIsScrolling(scrolling);
		if (scrolling) {
			setActiveDropdownId(null);
		}
	}, []);

	const handleUpdate = useCallback(
		(repo: string, tokenSecretId?: string): void => {
			runTransition((): void => {
				updatePlugin.mutate({ repo, frozenTokenSecretId: tokenSecretId });
			});
		},
		[updatePlugin, runTransition],
	);

	const handleDelete = useCallback(
		(repo: string): void => {
			runTransition((): void => {
				if (selectedSettings?.repo === repo) {
					setSelectedSettings(null);
				}
				deletePlugin.mutate(repo);
			});
		},
		[deletePlugin, runTransition, selectedSettings?.repo],
	);

	const handleSettings = useCallback(
		(repo: string, data?: PluginConfig): void => {
			runTransition((): void => {
				setSelectedSettings({ repo, data });
			});
		},
		[runTransition],
	);

	const handleCloseSettings = useCallback((): void => {
		runTransition((): void => {
			setSelectedSettings(null);
		});
	}, [runTransition]);

	const handleOpenAdd = useCallback((): void => {
		runTransition((): void => {
			setActiveDropdownId(null);
			filters.setShowSearch(false);
			requestInstallPlugin({});
		});
	}, [filters, requestInstallPlugin, runTransition]);

	const handleSearchToggle = useCallback((): void => {
		runTransition((): void => {
			setActiveDropdownId(null);
			const nextShow = !filters.showSearch;
			filters.setShowSearch(nextShow);
			if (!nextShow) {
				filters.clearSearch();
			}
		});
	}, [filters, runTransition]);

	const handleSetSearchQuery = useCallback(
		(query: string): void => {
			filters.setSearchQuery(query);
		},
		[filters],
	);

	const handleToggleFilter = useCallback(
		(filter: DashboardFilterType): void => {
			runTransition((): void => {
				filters.toggleFilter(filter);
			});
		},
		[filters, runTransition],
	);

	const handleDismissMutation = useCallback(
		(id: string): void => {
			runTransition((): void => {
				tracker.dismissMutation(id);
			});
		},
		[tracker, runTransition],
	);

	const handleRetryInstall = useCallback(
		(activeOp: ActiveInstallOperation): void => {
			runTransition((): void => {
				installPlugin.mutate({
					repo: activeOp.variables.repo,
					version: activeOp.variables.version,
					isFrozen: activeOp.variables.isFrozen,
					tokenSecretId: activeOp.variables.tokenSecretId,
					enableAfterInstall: activeOp.variables.enableAfterInstall,
					forceReinstall: activeOp.variables.forceReinstall,
					overrides: activeOp.variables.overrides,
				});
				canaryToast.info(`Retrying installation for ${activeOp.repo}`);
			});
		},
		[installPlugin, runTransition],
	);

	const handleDiscardInstall = useCallback(
		(activeOp: ActiveInstallOperation): void => {
			runTransition((): void => {
				workflowService.cancelOperation(activeOp.repo);
				updateOperationState({ repo: activeOp.repo, operation: null });
				tracker.dismissMutation(activeOp.id);
				canaryToast.info(`Discarded installation for ${activeOp.repo}`);
			});
		},
		[workflowService, updateOperationState, tracker, runTransition],
	);

	const handleCancelInstall = useCallback(
		(repo: string): void => {
			runTransition((): void => {
				const cancelRes = workflowService.cancelOperation(repo);
				if (cancelRes.ok) {
					canaryToast.info(`Cancelled installation for ${repo}`);
				} else {
					canaryToast.error(`Failed to cancel installation: ${cancelRes.error.message}`);
				}
			});
		},
		[workflowService, runTransition],
	);

	const viewState: DashboardViewState = useMemo((): DashboardViewState => {
		return {
			searchQuery: filters.searchQuery,
			showSearch: effectiveShowSearch,
			activeFilters: filters.activeFilters,
			filteredPlugins: filters.filteredPlugins,
			activeInstallations: tracker.activeInstallations,
			activeInstallationsMap: tracker.activeInstallationsMap,
			hasActiveInstallations: tracker.hasActiveInstallations,
			selectedSettings,
			isScrolling,
			isPending: isTransitionPending,
			isLoading: filters.isLoading,
			activeDropdownId: effectiveActiveDropdownId,
		};
	}, [
		filters.searchQuery,
		effectiveShowSearch,
		filters.activeFilters,
		filters.filteredPlugins,
		tracker.activeInstallations,
		tracker.activeInstallationsMap,
		tracker.hasActiveInstallations,
		selectedSettings,
		isScrolling,
		isTransitionPending,
		filters.isLoading,
		effectiveActiveDropdownId,
	]);

	const viewActions: DashboardViewActions = useMemo((): DashboardViewActions => {
		return {
			setSearchQuery: handleSetSearchQuery,
			setShowSearch: filters.setShowSearch,
			toggleFilter: handleToggleFilter,
			dismissMutation: handleDismissMutation,
			handleUpdate,
			handleDelete,
			handleSettings,
			handleCloseSettings,
			handleOpenAdd,
			handleSearchToggle,
			setIsScrolling: handleSetIsScrolling,
			handleOpenDropdown,
			handleRetryInstall,
			handleDiscardInstall,
			handleCancelInstall,
		};
	}, [
		handleSetSearchQuery,
		filters.setShowSearch,
		handleToggleFilter,
		handleDismissMutation,
		handleUpdate,
		handleDelete,
		handleSettings,
		handleCloseSettings,
		handleOpenAdd,
		handleSearchToggle,
		handleSetIsScrolling,
		handleOpenDropdown,
		handleRetryInstall,
		handleDiscardInstall,
		handleCancelInstall,
	]);

	return {
		state: viewState,
		actions: viewActions,
	};
}
