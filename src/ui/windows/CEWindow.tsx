import { useEffect, useRef, lazy, type JSX } from "react";
import { createPortal } from "react-dom";

import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { CanaryProviders } from "@/ui/components/CanaryProviders";
import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";
import { CanaryToaster } from "@/ui/components/toast/CanaryToaster";
import { PluginProvider } from "@/ui/context/PluginContext";
import { PortalProvider } from "@/ui/context/PortalContext";
import { useCanaryActions, useCanaryState } from "@/ui/hooks/useCanaryStore";
import { syncCommunityPlugins } from "@/ui/hooks/useCommunityPlugins";
import { useService } from "@/ui/hooks/useService";

import { WindowHeader } from "./components/WindowHeader";
import { useCEWindowViewModel } from "./hooks/useCEWindowViewModel";

import type CanaryEdgePlugin from "@/main";
import type { Section } from "@/ui/components/CEHeader";
import type { CEWindowViewState } from "./hooks/useCEWindowViewModel";

const LazyCEView = lazy(() => {
	return import("@/ui/views/CEView").then((mod) => {
		return { default: mod.CEView };
	});
});

interface CEWindowProps {
	readonly plugin: CanaryEdgePlugin;
	readonly onClose: () => void;
}

interface CEWindowInnerProps {
	readonly state: CEWindowViewState;
	readonly setPortalEl: (el: HTMLDivElement | null) => void;
	readonly onClose: () => void;
	readonly onRefresh: () => void;
	readonly onSectionChange: (section: Section) => void;
	readonly onHeaderClick: () => void;
}

function CEWindowInner({
	state,
	setPortalEl,
	onClose,
	onRefresh,
	onSectionChange,
	onHeaderClick,
}: CEWindowInnerProps): JSX.Element {
	const contentService = useService("gitHubContentService");
	const indexedDbService = useService("indexedDbService");

	const { setCEWindowVisibility, requestInstallPlugin } = useCanaryActions((storeActions) => {
		return {
			setCEWindowVisibility: storeActions.setCEWindowVisibility,
			requestInstallPlugin: storeActions.requestInstallPlugin,
		};
	});

	const activePrompt = useCanaryState((storeState) => {
		return storeState.ui.activePrompt;
	});

	useEffect((): (() => void) => {
		setCEWindowVisibility(true);
		void syncCommunityPlugins(contentService, indexedDbService, false).catch((err: unknown): void => {
			console.warn("[Canary-Edge] Automatic community plugins sync on CE window open encountered an issue:", err);
		});

		return (): void => {
			setCEWindowVisibility(false);
			requestInstallPlugin(null);
		};
	}, [setCEWindowVisibility, requestInstallPlugin, contentService, indexedDbService]);

	useEffect((): void => {
		if (activePrompt !== null) {
			if (typeof activeDocument !== "undefined" && activeDocument.activeElement instanceof HTMLElement) {
				activeDocument.activeElement.blur();
			}
		}
	}, [activePrompt]);

	return (
		<div aria-label="Canary Edge Window" className="ce-ce-window-two-card-layout" role="region">
			<WindowHeader
				isRefreshing={state.isRefreshing}
				title="Canary-Edge"
				onClick={onHeaderClick}
				onClose={onClose}
				onRefresh={onRefresh}
			/>

			<div ref={setPortalEl} className="ce-ce-window-content" tabIndex={-1}>
				{state.portalEl !== null ? (
					<PortalProvider value={{ portalRef: state.portalEl }}>
						<CanaryErrorBoundary>
							<LazyPanelBoundary loadingMessage="Loading view...">
								<LazyCEView activeSection={state.activeSection} onSectionChange={onSectionChange} />
							</LazyPanelBoundary>

							{createPortal(<CanaryToaster maxVisibleToasts={3} />, state.portalEl)}
						</CanaryErrorBoundary>
					</PortalProvider>
				) : null}
			</div>
		</div>
	);
}

interface CEWindowContainerProps {
	readonly onClose: () => void;
}

function CEWindowContainer({ onClose }: CEWindowContainerProps): JSX.Element {
	const windowRef = useRef<HTMLDivElement>(null);
	const ghostRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const animatorRef = useRef<HTMLDivElement>(null);

	const vm = useCEWindowViewModel({
		windowRef,
		ghostRef,
		containerRef,
		animatorRef,
		onClose,
	});

	return (
		<div ref={containerRef} className="ce-window-root">
			<div ref={animatorRef} className="ce-window-animator">
				<div ref={windowRef} aria-label="Canary Edge Dialog" className="ce-ce-window ce-theme-provider" role="dialog">
					<CEWindowInner
						onClose={vm.actions.handleClose}
						onHeaderClick={vm.actions.handleHeaderClick}
						onRefresh={vm.actions.handleRefresh}
						onSectionChange={vm.actions.handleSectionChange}
						setPortalEl={vm.actions.setPortalEl}
						state={vm.state}
					/>

					<div aria-label="Resize Window" className="ce-resize-handle-br" role="slider" tabIndex={-1} />
				</div>

				<div ref={ghostRef} className="ce-window-ghost" />
			</div>
		</div>
	);
}

export function CEWindow({ plugin, onClose }: CEWindowProps): JSX.Element {
	return (
		<PluginProvider plugin={plugin}>
			<CanaryProviders>
				<CEWindowContainer onClose={onClose} />
			</CanaryProviders>
		</PluginProvider>
	);
}
