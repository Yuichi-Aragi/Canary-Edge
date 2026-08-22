import { Suspense } from "react";

import { Button } from "@/ui/components/BaseComponents";
import { SettingsBox } from "@/ui/components/SettingsBox";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { JSX } from "react";
import type { ReleaseChannel, ReleaseVersion } from "@/domain/types";
import type { SecretSelectorProps } from "@/ui/components/SecretSelector";
import type { VersionSelectorProps } from "@/ui/components/VersionSelector";

const LazySecretSelector = lazyWithPreload<SecretSelectorProps>(async () => {
	const mod = await import("@/ui/components/SecretSelector");
	return { default: mod.SecretSelector };
});

const LazyVersionSelector = lazyWithPreload<VersionSelectorProps>(async () => {
	const mod = await import("@/ui/components/VersionSelector");
	return { default: mod.VersionSelector };
});

export interface PluginVersionAuthTabProps {
	readonly isBusy: boolean;
	readonly repoUrl: string;
	readonly tokenSecretId: string;
	readonly channel: ReleaseChannel;
	readonly secretOptions: readonly string[];
	readonly isValidatingToken: boolean;
	readonly setTokenSecretId: (val: string) => void;
	readonly currentVersion: string;
	readonly isVersionsSuccess: boolean;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly selectedVersion: string;
	readonly setSelectedVersion: (val: string) => void;
	readonly handleInstallVersion: () => void;
	readonly installButtonText: string;
}

export function PluginVersionAuthTab({
	isBusy,
	repoUrl,
	tokenSecretId,
	channel,
	secretOptions,
	isValidatingToken,
	setTokenSecretId,
	currentVersion,
	isVersionsSuccess,
	versions,
	selectedVersion,
	setSelectedVersion,
	handleInstallVersion,
	installButtonText,
}: PluginVersionAuthTabProps): JSX.Element {
	return (
		<>
			<SettingsBox
				control={
					<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
						<LazySecretSelector
							compact
							disabled={isBusy}
							isValidating={isValidatingToken}
							options={secretOptions}
							value={tokenSecretId}
							onChange={setTokenSecretId}
						/>
					</Suspense>
				}
				description="Select a secret containing your GitHub PAT for this specific plugin. Useful for private repositories or bypassing rate limits."
				icon="key"
				iconVariant="yellow"
				isDisabled={isBusy}
				title="Personal access token (Secret)"
			/>

			<SettingsBox
				control={
					<div className="ce-version-installer-container">
						<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
							<LazyVersionSelector
								channel={channel}
								disabled={isBusy || !isVersionsSuccess}
								repoUrl={repoUrl}
								tokenSecretId={tokenSecretId}
								value={selectedVersion}
								versions={versions}
								onChange={setSelectedVersion}
							/>
						</Suspense>
						<Button
							disabled={isBusy || !isVersionsSuccess}
							text={installButtonText}
							variant="cta"
							onClick={handleInstallVersion}
						/>
					</div>
				}
				description={`Current version: ${currentVersion}. Select a version to install or fallback to latest.`}
				icon="git-branch"
				iconVariant="blue"
				isDisabled={isBusy || !isVersionsSuccess}
				title="Plugin Version"
			/>
		</>
	);
}
