import { lazy, useEffect, useCallback, type JSX } from "react";
import { match } from "ts-pattern";

import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";
import { useCEViewModel } from "@/ui/hooks/useCEViewModel";

import type { CEViewState, CEViewActions } from "@/ui/hooks/useCEViewModel";
import type { Section } from "@/ui/components/CEHeader";

const LazyGeneralSection = lazy(() =>
	import("./sections/GeneralSection").then((mod) => ({ default: mod.GeneralSection }))
);
const LazyDashboardSection = lazy(() =>
	import("./sections/DashboardSection").then((mod) => ({ default: mod.DashboardSection }))
);

const LazyInstallPluginPanel = lazy(() =>
	import("@/ui/components/InstallPluginPanel").then((mod) => ({ default: mod.InstallPluginPanel }))
);

const LazyConfirmPanel = lazy(() =>
	import("@/ui/components/ConfirmPanel").then((mod) => ({ default: mod.ConfirmPanel }))
);

const LazyChangelogPanel = lazy(() =>
	import("@/ui/components/ChangelogPanel").then((mod) => ({ default: mod.ChangelogPanel }))
);

interface CEViewContentProps {
	readonly state: CEViewState;
	readonly actions: CEViewActions;
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

function CEViewContent({ state, actions, activeSection, onSectionChange }: CEViewContentProps): JSX.Element {
	useEffect((): void => {
		if (state.confirmRequest !== null || state.changelogRequest !== null) {
			if (typeof activeDocument !== "undefined" && activeDocument.activeElement instanceof HTMLElement) {
				activeDocument.activeElement.blur();
			}
		}
	}, [state.confirmRequest, state.changelogRequest]);

	const handleInstallSuccess = useCallback((): void => {
		state.installPluginRequest?.onSuccess?.();
		onSectionChange("Dashboard");
	}, [state.installPluginRequest, onSectionChange]);

	return (
		<div className="ce-ce-view">
			<div className="ce-ce-view-content">
				<LazyPanelBoundary loadingMessage="Loading panel...">
					{match(activeSection)
						.with("General", (): JSX.Element => (
							<LazyGeneralSection 
								activeSection={activeSection} 
								onSectionChange={onSectionChange} 
							/>
						))
						.with("Dashboard", (): JSX.Element => (
							<LazyDashboardSection 
								activeSection={activeSection} 
								onSectionChange={onSectionChange} 
							/>
						))
						.otherwise((): null => null)}
				</LazyPanelBoundary>
			</div>
			
			{state.installPluginRequest !== null ? (
				<LazyPanelBoundary loadingMessage="Configuring installer...">
					<LazyInstallPluginPanel
						options={{
							...state.installPluginRequest,
							onSuccess: handleInstallSuccess,
						}}
						onClose={actions.handleCloseInstallPlugin}
					/>
				</LazyPanelBoundary>
			) : null}

			{state.confirmRequest !== null ? (
				<LazyPanelBoundary loadingMessage="Loading confirmation...">
					<LazyConfirmPanel 
						key={state.confirmRequest.id}
						request={state.confirmRequest}
					/>
				</LazyPanelBoundary>
			) : null}

			{state.changelogRequest !== null ? (
				<LazyPanelBoundary loadingMessage="Loading changelog...">
					<LazyChangelogPanel
						key={state.changelogRequest.id}
						request={state.changelogRequest}
					/>
				</LazyPanelBoundary>
			) : null}
		</div>
	);
}

export interface CEProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

export function CEView({ activeSection, onSectionChange }: CEProps): JSX.Element {
	const vm = useCEViewModel();
	return (
		<CEViewContent 
			actions={vm.actions} 
			activeSection={activeSection} 
			onSectionChange={onSectionChange} 
			state={vm.state} 
		/>
	);
}
