import invariant from "tiny-invariant";

import { coerceVersion, compareVersions } from "@/utils/semverUtils";

import type { PluginManifest } from "obsidian";
import type {
	Cradle,
	InstallOperationResult,
	InstallOptions,
	OperationContext,
	PluginLifecycleAction,
	ValidationContext,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

interface InstallationCheckResult {
	readonly action: PluginLifecycleAction;
	readonly localManifest: PluginManifest | null;
	readonly context: Readonly<ValidationContext>;
}

export class PluginInstallOperation {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async execute(
		ctx: OperationContext,
		options: Readonly<InstallOptions>,
	): Promise<Result<InstallOperationResult>> {
		return await ctx.safeCtx.async<InstallOperationResult>(async ($, defer) => {
			invariant(ctx.repo !== "", "Repository path is required");

			let succeeded = false;
			const guard = this.deps.operationTrackingService.createScopeGuard(
				ctx.repo,
				"install",
				`Installation failed for repository: ${ctx.repo}`,
			);
			const activeCtx = ctx.withGuard(guard);

			defer((): void => {
				guard.cleanup(succeeded);
			});

			console.info(`[Canary-Edge] [InstallOperation] [${ctx.repo}] Commencing installation workflow...`);
			activeCtx.progress("Verification", "Checking local installation state...");

			const checkRes = $(await this.inspectInstallationState(activeCtx, options));
			const { action, localManifest, context: validation } = checkRes;
			const targetVersion = validation.manifest.version;
			const previousVersion = localManifest?.version;

			if (action === "unchanged") {
				console.info(
					`[Canary-Edge] [InstallOperation] [${ctx.repo}] Plugin is already installed at target version (v${targetVersion}). Synchronizing settings...`,
				);
				$(await this.syncSettingsOnly(activeCtx, options, validation.manifest.id));
				guard.complete(`Already installed (v${targetVersion})`);
				succeeded = true;
				return {
					wasInstalled: false,
					action: "unchanged",
					version: targetVersion,
					previousVersion,
				};
			}

			const result = $(await this.performInstall(activeCtx, options, action, validation, localManifest));

			if (result.wasInstalled === true) {
				this.deps.canaryStore.clearDetectedUpdates(ctx.repo);
			}

			const telemetryMessage = this.formatCompletionTelemetry(result);
			guard.complete(telemetryMessage);
			succeeded = true;
			return result;
		});
	}

	private async inspectInstallationState(
		ctx: OperationContext,
		options: Readonly<InstallOptions>,
	): Promise<Result<InstallationCheckResult>> {
		return await ctx.safeCtx.async<InstallationCheckResult>(async ($) => {
			const validation = $(
				await this.deps.repositoryService.validateAndFetchManifest(
					ctx,
					options.specifyVersion,
					ctx.overrides?.releaseChannel,
				),
			);

			const pluginId = $(await this.deps.pluginQueryService.getPluginIdByRepo(ctx.repo));
			const targetId = pluginId ?? validation.manifest.id;
			const localManifest = $(await this.deps.pluginQueryService.getLocalManifest(targetId, ctx.safeCtx));

			if (localManifest === null) {
				return {
					action: "installed",
					localManifest: null,
					context: validation,
				};
			}

			const localVersionParsed = coerceVersion(localManifest.version, { includePrerelease: true, loose: true });
			const remoteVersionParsed = coerceVersion(validation.manifest.version, { includePrerelease: true, loose: true });

			if (options.forceReinstall === true) {
				if (localVersionParsed !== null && remoteVersionParsed !== null) {
					const cmp = compareVersions(localVersionParsed, remoteVersionParsed);
					if (cmp === -1) {
						return { action: "upgraded", localManifest, context: validation };
					}
					if (cmp === 1) {
						return { action: "downgraded", localManifest, context: validation };
					}
				}
				return { action: "reinstalled", localManifest, context: validation };
			}

			if (localVersionParsed !== null && remoteVersionParsed !== null) {
				const cmp = compareVersions(localVersionParsed, remoteVersionParsed);
				if (cmp === 0) {
					return { action: "unchanged", localManifest, context: validation };
				}
				if (cmp === -1) {
					return { action: "upgraded", localManifest, context: validation };
				}
				return { action: "downgraded", localManifest, context: validation };
			}

			if (localManifest.version === validation.manifest.version) {
				return { action: "unchanged", localManifest, context: validation };
			}

			return { action: "reinstalled", localManifest, context: validation };
		});
	}

	private async syncSettingsOnly(
		ctx: OperationContext,
		options: Readonly<InstallOptions>,
		pluginId: string,
	): Promise<Result<undefined>> {
		return await ctx.safeCtx.async<undefined>(async ($) => {
			ctx.progress("Configuration", "Updating configuration settings...");

			const settings = $(await this.deps.settingsService.getSettingsQueued());

			let isIncompatible = false;
			const localManifest =
				pluginId !== "" ? $(await this.deps.pluginQueryService.getLocalManifest(pluginId, ctx.safeCtx)) : null;
			if (localManifest !== null) {
				const compat = $(this.deps.pluginCompatibilityService.checkOverallCompatibility(localManifest, ctx));
				isIncompatible = compat.isCompatible === false;
			}

			$(
				await this.deps.settingsService.upsertPlugin(
					ctx.repo,
					{
						isFrozen: options.isFrozen,
						privateApiKeySecretId: ctx.secretId,
						isIncompatible,
						preserveFrozenStatus: true,
						overrides: ctx.overrides,
					},
					settings.version,
				),
			);

			if (pluginId !== "") {
				ctx.progress("Activation", "Applying plugin lifecycle state...");
				$(await this.deps.pluginDeploymentService.applyLifecycleState(ctx, pluginId, options.enableAfterInstall));
			}

			return undefined;
		});
	}

	private async performInstall(
		ctx: OperationContext,
		options: Readonly<InstallOptions>,
		action: PluginLifecycleAction,
		validation: Readonly<ValidationContext>,
		localManifest: PluginManifest | null,
	): Promise<Result<InstallOperationResult>> {
		return await ctx.safeCtx.async<InstallOperationResult>(async ($) => {
			const targetVersion = validation.manifest.version;
			const previousVersion = localManifest?.version;
			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			const effectiveShowChangelog = ctx.overrides?.showChangelog ?? config.showChangelog;
			const effectiveReleaseChannel = ctx.overrides?.releaseChannel ?? config.releaseChannel;

			const changelogOptions = {
				version: targetVersion,
				releaseChannel: effectiveReleaseChannel,
				preResolvedBody: validation.release.body,
				showChangelog: effectiveShowChangelog,
				onChangelogReady: options.onChangelogReady,
			};

			if (effectiveShowChangelog.mode === "before") {
				ctx.progress("Changelog", "Awaiting changelog review...");
			}

			const shouldProceed = $(await this.deps.pluginChangelogService.promptChangelogBefore(ctx, changelogOptions));
			if (shouldProceed === false) {
				return {
					wasInstalled: false,
					action: "unchanged",
					version: targetVersion,
					previousVersion,
				};
			}

			console.info(
				`[Canary-Edge] [InstallOperation] [${ctx.repo}] Downloading release assets for action '${action}' (target: v${targetVersion})...`,
			);
			ctx.progress("Download", "Downloading plugin release assets...");

			const release = $(
				await this.deps.pluginAcquisitionService.acquireRelease(ctx, {
					specifyVersion: options.specifyVersion,
					context: validation,
					onPhase: (phase): void => {
						if (phase === "downloading") {
							ctx.progress("Download", "Downloading plugin release assets from GitHub...");
						} else if (phase === "finalizing") {
							ctx.progress("Compatibility", "Preparing and finalizing plugin manifest...");
						}
					},
				}),
			);

			console.info(`[Canary-Edge] [InstallOperation] [${ctx.repo}] Deploying release assets to vault...`);
			ctx.progress("Deployment", "Writing plugin files to vault...");

			const settings = $(await this.deps.settingsService.getSettingsQueued());

			$(
				await this.deps.pluginDeploymentService.deploy(ctx, {
					manifest: release.manifest,
					files: release.files,
					isIncompatible: release.isIncompatible,
					isFrozen: options.isFrozen,
					enableAfterInstall: options.enableAfterInstall,
					isReinstall: localManifest !== null,
					expectedVersion: settings.version,
					onPhase: (phase): void => {
						if (phase === "files") {
							ctx.progress("Deployment", "Writing plugin files to vault...");
						} else if (phase === "settings" || phase === "manifests") {
							ctx.progress("Configuration", "Updating plugin settings and manifest...");
						} else if (phase === "lifecycle") {
							ctx.progress("Activation", "Activating plugin instance...");
						}
					},
				}),
			);

			await this.deps.pluginChangelogService.notifyChangelogAfter(ctx, changelogOptions);

			console.info(
				`[Canary-Edge] [InstallOperation] [${ctx.repo}] Operation '${action}' finished successfully (version: ${release.manifest.version}).`,
			);
			return {
				wasInstalled: true,
				action,
				version: release.manifest.version,
				previousVersion,
			};
		});
	}

	private formatCompletionTelemetry(result: Readonly<InstallOperationResult>): string {
		const { action, version, previousVersion } = result;
		switch (action) {
			case "installed": {
				return `Installed (v${version})`;
			}
			case "reinstalled": {
				return `Reinstalled (v${version})`;
			}
			case "upgraded": {
				const prev = previousVersion !== undefined ? `v${previousVersion} -> ` : "";
				return `Upgraded (${prev}v${version})`;
			}
			case "downgraded": {
				const prev = previousVersion !== undefined ? `v${previousVersion} -> ` : "";
				return `Downgraded (${prev}v${version})`;
			}
			case "unchanged": {
				return `Already up to date (v${version})`;
			}
			default: {
				const _exhaustive: never = action;
				throw new Error(`Unhandled lifecycle action: ${_exhaustive as string}`);
			}
		}
	}
}
