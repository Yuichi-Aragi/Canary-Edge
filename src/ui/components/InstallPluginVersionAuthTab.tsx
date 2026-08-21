import { Suspense, type JSX } from "react";
import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { clsx } from "clsx";

import { SettingsBox } from "@/ui/components/SettingsBox";
import { ToggleSettingsBox } from "@/ui/components/ToggleSettingsBox";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type {
	GitHubTokenInfo,
	ReleaseChannel,
	ReleaseVersion,
} from "@/domain/types";
import type { InstallPluginFormData } from "@/domain/schemas";
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

export interface InstallPluginVersionAuthTabProps {
	readonly control: Control<InstallPluginFormData>;
	readonly isVersionsSuccess: boolean;
	readonly isPending: boolean;
	readonly isConflict: boolean;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly secretOptions: readonly string[];
	readonly watchedUseToken: boolean;
	readonly tokenInfo: GitHubTokenInfo | null | undefined;
	readonly handleTokenValidation: () => Promise<boolean>;
	readonly errors: FieldErrors<InstallPluginFormData>;
	readonly repoUrl: string;
	readonly tokenSecretId?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
}

export function InstallPluginVersionAuthTab({
	control,
	isVersionsSuccess,
	isPending,
	isConflict,
	versions,
	secretOptions,
	watchedUseToken,
	tokenInfo,
	handleTokenValidation,
	errors,
	repoUrl,
	tokenSecretId,
	channel,
}: InstallPluginVersionAuthTabProps): JSX.Element {
	const isTokenValid = tokenInfo?.validToken ?? false;

	return (
		<>
			<SettingsBox
				control={
					<div className="ce-version-installer-container">
						<Controller
							control={control}
							name="version"
							render={({ field }): JSX.Element => (
								<Suspense fallback={<div className="ce-version-card is-loading"><span className="ce-version-name">Loading...</span></div>}>
									<LazyVersionSelector
										channel={channel}
										disabled={isVersionsSuccess === false || isPending === true || isConflict === true}
										repoUrl={repoUrl}
										tokenSecretId={watchedUseToken === true ? tokenSecretId : undefined}
										value={field.value}
										versions={versions}
										onChange={field.onChange}
									/>
								</Suspense>
							)}
						/>
					</div>
				}
				description="Select a specific release tag to install, or target the latest available version."
				icon="git-branch"
				iconVariant="blue"
				isDisabled={isVersionsSuccess === false || isPending === true || isConflict === true}
				title="Plugin Version"
			/>

			<Controller
				control={control}
				name="usePrivateApiKey"
				render={({ field }): JSX.Element => (
					<ToggleSettingsBox
						checked={field.value}
						description={
							<div className="ce-pat-description">
								<span>Configure an isolated authentication token for this repository to bypass rate limits or access private sources.</span>
								{watchedUseToken === true ? (
									<div className="ce-pat-input-wrapper">
										<Controller
											control={control}
											name="privateApiKeySecretId"
											render={({ field: secretField }): JSX.Element => (
												<Suspense fallback={<div className="ce-secret-card is-loading"><span className="ce-secret-name">Loading...</span></div>}>
													<LazySecretSelector
														compact
														disabled={isConflict}
														options={secretOptions}
														value={secretField.value ?? ""}
														onChange={(val: string): void => {
															secretField.onChange(val);
															if (val !== "") {
																void handleTokenValidation();
															}
														}}
													/>
												</Suspense>
											)}
										/>
										{errors.privateApiKeySecretId !== undefined ? (
											<div className="ce-form-error">{errors.privateApiKeySecretId.message}</div>
										) : null}
										{tokenInfo !== null && tokenInfo !== undefined ? (
											<div className="ce-token-info">
												<div className={clsx("ce-token-status", isTokenValid === true ? "is-valid" : "is-invalid")}>
													{isTokenValid === true ? "Token is valid" : `Token is invalid: ${tokenInfo.error.message}`}
												</div>
											</div>
										) : null}
									</div>
								) : null}
							</div>
						}
						icon="key"
						iconVariant="yellow"
						isDisabled={isConflict}
						title="Personal Access Token (Secret)"
						onChange={field.onChange}
					/>
				)}
			/>
		</>
	);
}
