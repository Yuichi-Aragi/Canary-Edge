import { useState, useCallback, useRef, type RefObject } from "react";
import { useCanaryActions } from "@/ui/hooks/useCanaryStore";
import { queryClient } from "@/core/queryClient";
import { useCEWindowState } from "./useCEWindowState";
import { useWindowAnimations } from "./useWindowAnimations";
import { useInteractWindow } from "./useInteractWindow";
import type { Section } from "@/ui/components/CEHeader";
import type { WindowState } from "../types";

export interface CEWindowViewState {
	readonly portalEl: HTMLDivElement | null;
	readonly activeSection: Section;
	readonly lastActiveSection: Section;
	readonly displayRect: WindowState;
	readonly isRefreshing: boolean;
}

interface CEWindowViewActions {
	readonly setPortalEl: (el: HTMLDivElement | null) => void;
	readonly handleClose: () => void;
	readonly handleRefresh: () => void;
	readonly handleSectionChange: (section: Section) => void;
	readonly handleHeaderClick: () => void;
}

export interface CEWindowViewModel {
	readonly state: CEWindowViewState;
	readonly actions: CEWindowViewActions;
}

export interface UseCEWindowViewModelOptions {
	readonly windowRef: RefObject<HTMLDivElement | null>;
	readonly ghostRef: RefObject<HTMLDivElement | null>;
	readonly containerRef: RefObject<HTMLDivElement | null>;
	readonly animatorRef: RefObject<HTMLDivElement | null>;
	readonly onClose: () => void;
}

export function useCEWindowViewModel(options: UseCEWindowViewModelOptions): CEWindowViewModel {
	const { windowRef, ghostRef, containerRef, animatorRef, onClose } = options;
	const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

	const { displayRect, setWindowState, resetToDefault } = useCEWindowState();
	const animateExit = useWindowAnimations({ containerRef, animatorRef });

	const [activeSection, setActiveSection] = useState<Section>("General");
	const [lastActiveSection, setLastActiveSection] = useState<Section>("General");

	const isExecutingResetRef = useRef<boolean>(false);

	const resetRuntime = useCanaryActions((actions) => {
		return actions.resetRuntime;
	});

	const requestConfirm = useCanaryActions((actions) => {
		return actions.requestConfirm;
	});

	useInteractWindow({
		windowRef,
		ghostRef,
		displayRect,
		setWindowState,
	});

	const handleClose = useCallback((): void => {
		animateExit(onClose);
	}, [animateExit, onClose]);

	const handleRefresh = useCallback((): void => {
		if (isRefreshing || isExecutingResetRef.current) {
			return;
		}

		const requestId = `reset-window-state-${Date.now().toString()}-${Math.random().toString(36).substring(2, 9)}`;

		const confirmPromise = new Promise<boolean>((resolve): void => {
			requestConfirm({
				id: requestId,
				request: {
					type: "resetWindowState",
					repo: "Canary-Edge",
				},
				resolve,
			});
		});

		void confirmPromise.then((confirmed: boolean): void => {
			if (confirmed) {
				if (isExecutingResetRef.current) {
					return;
				}
				isExecutingResetRef.current = true;
				setIsRefreshing(true);

				queryClient.clear();
				resetRuntime();
				resetToDefault();
				animateExit(onClose);
			}
		});
	}, [isRefreshing, requestConfirm, resetRuntime, resetToDefault, animateExit, onClose]);

	const handleSectionChange = useCallback((section: Section): void => {
		setLastActiveSection(section);
		setActiveSection(section);
	}, []);

	const handleHeaderClick = useCallback((): void => {
		handleSectionChange(lastActiveSection);
	}, [lastActiveSection, handleSectionChange]);

	return {
		state: {
			portalEl,
			activeSection,
			lastActiveSection,
			displayRect,
			isRefreshing,
		},
		actions: {
			setPortalEl,
			handleClose,
			handleRefresh,
			handleSectionChange,
			handleHeaderClick,
		},
	};
}
