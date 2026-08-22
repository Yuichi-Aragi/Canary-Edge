import { useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import { PluginSettingsView } from "@/ui/views/PluginSettingsView";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { PluginCard } from "@/ui/components/PluginCard";
import { BasePanel } from "@/ui/components/BasePanel";
import { useCanaryState } from "@/ui/hooks/useCanaryStore";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { JSX } from "react";
import type { PluginConfig } from "@/domain/types";

export interface PluginSettingsPanelProps {
	readonly repo: string;
	readonly initialData: PluginConfig | undefined;
	readonly onDelete: (repo: string) => void;
	readonly onUpdate: (repo: string, tokenSecretId?: string) => void;
	readonly onClose: () => void;
}

export function PluginSettingsPanel({
	repo,
	initialData,
	onDelete,
	onUpdate,
	onClose,
}: PluginSettingsPanelProps): JSX.Element {
	const operations = useCanaryState(
		(state) => state.runtime.operations,
	);
	const scrubbedRepo = scrubRepositoryUrl(repo);
	const operation = operations[scrubbedRepo];
	
	const isBusy = operation?.status === "pending";

	const sessionKey = useMemo((): string => {
		return `${scrubbedRepo}:${uuidv4()}`;
	}, [scrubbedRepo]);

	return (
		<BasePanel isOpen onClose={onClose}>
			<div className="ce-dashboard-card-wrapper">
				<CanaryErrorBoundary variant="card">
					<PluginCard
						frozenData={initialData}
						operation={operation}
						repo={repo}
						onDelete={onDelete}
						onSettings={(): void => {
							onClose();
						}}
						onUpdate={onUpdate}
					/>
				</CanaryErrorBoundary>
			</div>

			<div className="ce-dashboard-card-wrapper mod-settings-panel">
				{operation?.status === "pending" ? (
					<div className="ce-settings-box mod-busy-state">
						<div className="ce-settings-box-row mod-title">
							Operation in Progress
						</div>
						<div className="ce-settings-box-row mod-description">
							Settings are locked while the plugin is being processed.
							<br />
							<strong>Status:</strong> {operation.message}
						</div>
					</div>
				) : null}
				<CanaryErrorBoundary>
					<PluginSettingsView
						key={sessionKey}
						initialData={initialData}
						isLocked={isBusy}
						repo={repo}
						onClose={onClose}
					/>
				</CanaryErrorBoundary>
			</div>
		</BasePanel>
	);
}
