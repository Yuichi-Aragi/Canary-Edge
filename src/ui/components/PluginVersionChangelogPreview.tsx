import { useCallback, useMemo, type JSX } from "react";

import { createOperationContext } from "@/services/OperationContext";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { MarkdownView } from "@/ui/components/MarkdownView";
import { PluginCard } from "@/ui/components/PluginCard";
import { StateContainer } from "@/ui/components/StateContainer";
import { usePluginChangelog, useRemoteManifest } from "@/ui/hooks/useGitHub";
import { useService } from "@/ui/hooks/useService";
import { safe } from "@/utils/safe";

import type { ChangelogPriority, ReleaseChannel } from "@/domain/types";
import type { PluginCardOverrideData } from "@/ui/hooks/usePluginCardViewModel";

export interface PluginVersionChangelogPreviewProps {
	readonly repoUrl: string;
	readonly version: string;
	readonly channel: ReleaseChannel;
	readonly priority: ChangelogPriority;
	readonly tokenSecretId?: string | undefined;
	readonly hideCard?: boolean | undefined;
	readonly isEnabled?: boolean | undefined;
}

function renderChangelogContent(
	isLoading: boolean,
	isError: boolean,
	content: string,
	onRetry?: () => void,
): JSX.Element {
	if (isLoading && content === "") {
		return <StateContainer message="Fetching changelog..." type="loading" />;
	}
	if (isError) {
		return (
			<StateContainer
				message="Failed to fetch changelog for this version."
				title="Changelog Unavailable"
				type="error"
				onRetry={onRetry}
			/>
		);
	}
	if (content.trim() === "") {
		return <StateContainer message="No changelog entries provided for this release." type="empty" />;
	}
	return (
		<div className="ce-readme-tab-container">
			<CanaryErrorBoundary variant="card">
				<MarkdownView markdown={content} />
			</CanaryErrorBoundary>
		</div>
	);
}

export function PluginVersionChangelogPreview(
	props: PluginVersionChangelogPreviewProps,
): JSX.Element {
	const {
		repoUrl,
		version,
		channel,
		priority,
		tokenSecretId,
		hideCard: hideCardProp,
		isEnabled: isEnabledProp,
	} = props;

	const hideCard = hideCardProp ?? false;
	const isEnabled = isEnabledProp ?? true;

	const compatibilityService = useService("pluginCompatibilityService");
	const effectiveVersion = version !== "" ? version : "latest";
	const isQueryEnabled = isEnabled && repoUrl.trim() !== "";
	const shouldFetchManifest = !hideCard && isQueryEnabled;

	const { data: validationCtx, isLoading: isLoadingManifest } = useRemoteManifest({
		repoUrl,
		version: effectiveVersion,
		channel,
		tokenSecretId,
		isEnabled: shouldFetchManifest,
	});

	const {
		data: changelog,
		isLoading: isLoadingChangelog,
		isError: isChangelogError,
		refetch: refetchChangelog,
	} = usePluginChangelog({
		repoUrl,
		version: effectiveVersion,
		channel,
		priority,
		tokenSecretId,
		isEnabled: isQueryEnabled,
	});

	const manifest = validationCtx?.manifest;

	const isIncompatible = useMemo((): boolean => {
		if (manifest === undefined) {
			return false;
		}

		const opCtx = createOperationContext({
			repo: repoUrl,
			operationType: "check",
		});

		const compatResult = compatibilityService.checkOverallCompatibility(manifest, opCtx);
		const overall = safe.unwrapOr(compatResult, null);
		if (overall === null) {
			return false;
		}

		return !overall.isCompatible;
	}, [manifest, repoUrl, compatibilityService]);

	const remoteCardData: PluginCardOverrideData = useMemo((): PluginCardOverrideData => {
		if (manifest !== undefined) {
			return {
				name: manifest.name,
				version: manifest.version,
				description: manifest.description,
				author: manifest.author,
				isIncompatible,
			};
		}

		const fallbackName = repoUrl.includes("/") ? (repoUrl.split("/")[1] ?? repoUrl) : repoUrl;
		const displayVersion = effectiveVersion !== "" && effectiveVersion !== "latest" ? effectiveVersion : "Latest";

		return {
			name: fallbackName,
			version: displayVersion,
			description: isLoadingManifest ? "Fetching remote plugin manifest..." : "",
			author: undefined,
			isIncompatible: false,
		};
	}, [manifest, repoUrl, effectiveVersion, isLoadingManifest, isIncompatible]);

	const noopSettings = useCallback((): void => {}, []);
	const handleRetry = useCallback((): void => {
		void refetchChangelog();
	}, [refetchChangelog]);

	const effectiveChangelog = changelog ?? "";
	const isChangelogLoading = isLoadingChangelog && effectiveChangelog === "";

	return (
		<>
			{!hideCard ? (
				<div className="ce-dashboard-card-wrapper">
					<CanaryErrorBoundary variant="card">
						<PluginCard
							hideActions
							overrideData={remoteCardData}
							repo={repoUrl}
							onSettings={noopSettings}
						/>
					</CanaryErrorBoundary>
				</div>
			) : null}

			<div className="ce-dashboard-card-wrapper mod-settings-panel">
				{renderChangelogContent(isChangelogLoading, isChangelogError, effectiveChangelog, handleRetry)}
			</div>
		</>
	);
}
