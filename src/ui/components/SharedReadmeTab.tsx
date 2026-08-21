import type { JSX } from "react";

import { usePluginReadme } from "@/ui/hooks/usePluginReadme";
import { StateContainer } from "@/ui/components/StateContainer";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { MarkdownView } from "@/ui/components/MarkdownView";

export interface SharedReadmeTabProps {
	readonly repoUrl: string;
	readonly tokenSecretId?: string | undefined;
	readonly isEnabled?: boolean | undefined;
}

export function SharedReadmeTab(props: SharedReadmeTabProps): JSX.Element {
	const {
		repoUrl,
		tokenSecretId,
		isEnabled: isEnabledProp,
	} = props;
	const isEnabled = isEnabledProp ?? true;

	const { data: readme, isLoading, isError, error, refetch } = usePluginReadme(
		repoUrl,
		tokenSecretId,
		isEnabled
	);

	if (isLoading === true) {
		return <StateContainer message="Fetching README content..." type="loading" />;
	}

	if (isError === true) {
		return (
			<StateContainer
				message={error instanceof Error ? error.message : "Failed to load README file."}
				title="Failed to Load README"
				type="error"
				onRetry={(): void => {
					void refetch();
				}}
			/>
		);
	}

	if (readme === undefined || readme.trim() === "") {
		return <StateContainer message="No README found for this repository." type="empty" />;
	}

	return (
		<div className="ce-readme-tab-container">
			<CanaryErrorBoundary variant="card">
				<MarkdownView markdown={readme} />
			</CanaryErrorBoundary>
		</div>
	);
}
