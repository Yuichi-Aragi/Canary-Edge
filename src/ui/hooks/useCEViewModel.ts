import { useCallback } from "react";

import { useCanaryState, useCanaryActions } from "@/ui/hooks/useCanaryStore";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";

import type { InstallPluginModalOptions, ConfirmRequest, ChangelogRequest, ActivePrompt } from "@/domain/types";

export interface CEViewState {
	readonly installPluginRequest: InstallPluginModalOptions | null;
	readonly activePrompt: ActivePrompt | null;
	readonly confirmRequest: ConfirmRequest | null;
	readonly changelogRequest: ChangelogRequest | null;
	readonly isPending: boolean;
}

export interface CEViewActions {
	readonly handleCloseInstallPlugin: () => void;
	readonly handleCancelConfirm: () => void;
	readonly handleCancelChangelog: () => void;
}

export interface CEViewModel {
	readonly state: CEViewState;
	readonly actions: CEViewActions;
}

export function useCEViewModel(): CEViewModel {
	const { isPending, runTransition } = useTransitionAction();

	const installPluginRequest = useCanaryState((state) => {
		return state.ui.installPluginRequest;
	});
	const activePrompt = useCanaryState((state) => {
		return state.ui.activePrompt;
	});
	const confirmRequest = useCanaryState((state) => {
		return state.ui.confirmRequest;
	});
	const changelogRequest = useCanaryState((state) => {
		return state.ui.changelogRequest;
	});

	const requestInstallPlugin = useCanaryActions((actions) => {
		return actions.requestInstallPlugin;
	});
	const dismissConfirmById = useCanaryActions((actions) => {
		return actions.dismissConfirmById;
	});
	const dismissChangelogById = useCanaryActions((actions) => {
		return actions.dismissChangelogById;
	});

	const handleCloseInstallPlugin = useCallback((): void => {
		runTransition((): void => {
			requestInstallPlugin(null);
		});
	}, [requestInstallPlugin, runTransition]);

	const handleCancelConfirm = useCallback((): void => {
		if (confirmRequest !== null) {
			const targetRequest = confirmRequest;
			runTransition((): void => {
				try {
					targetRequest.resolve(false);
				} catch (error: unknown) {
					console.error("Failed to resolve cancelled confirmation request:", error);
				}
				dismissConfirmById(targetRequest.id);
			});
		}
	}, [confirmRequest, dismissConfirmById, runTransition]);

	const handleCancelChangelog = useCallback((): void => {
		if (changelogRequest !== null) {
			const targetRequest = changelogRequest;
			runTransition((): void => {
				try {
					targetRequest.resolve(false);
				} catch (error: unknown) {
					console.error("Failed to resolve cancelled changelog request:", error);
				}
				dismissChangelogById(targetRequest.id);
			});
		}
	}, [changelogRequest, dismissChangelogById, runTransition]);

	return {
		state: { installPluginRequest, activePrompt, confirmRequest, changelogRequest, isPending },
		actions: { handleCloseInstallPlugin, handleCancelConfirm, handleCancelChangelog }
	};
}
