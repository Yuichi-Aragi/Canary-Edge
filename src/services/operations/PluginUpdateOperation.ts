import { v4 as uuidv4 } from "uuid";
import invariant from "tiny-invariant";

import { coerceVersion, compareVersions } from "@/utils/semverUtils";

import type {
	Cradle,
	DetectedUpdate,
	OperationContext,
	PluginUpdateStatus,
	UpdateOperationResult,
	UpdateOptions,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

interface UpdateNeedEvaluation {
	readonly status: PluginUpdateStatus;
	readonly isUpdateApplicable: boolean;
	readonly updateAvailableDetails?: { readonly local: string; readonly remote: string } | undefined;
}

export class PluginUpdateOperation {
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
		options: Readonly<UpdateOptions>,
	): Promise<Result<UpdateOperationResult>> {
		return await ctx.safeCtx.async<UpdateOperationResult>(async ($, defer) => {
			invariant(ctx.repo !== "", "Repository path is required");

			let succeeded = false;
			const guard = this.deps.operationTrackingService.createScopeGuard(
				ctx.repo,
				"update",
				`Update failed for repository: ${ctx.repo}`,
			);
			const activeCtx = ctx.withGuard(guard);

			defer((): void => {
				guard.cleanup(succeeded);
			});

			console.info(`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Commencing update check and resolution...`);
			activeCtx.progress("Resolution", "Checking GitHub for latest release...");

			const remoteRelease = $(
				await this.deps.repositoryService.resolveRelease(
					activeCtx,
					options.specifyVersion,
					ctx.overrides?.releaseChannel,
				),
			);

			activeCtx.progress("Verification", "Reading local plugin manifest...");
			const pluginId = $(await this.deps.pluginQueryService.getPluginIdByRepo(ctx.repo));
			const localManifest =
				pluginId !== undefined
					? $(await this.deps.pluginQueryService.getLocalManifest(pluginId, activeCtx.safeCtx))
					: null;

			activeCtx.progress("Evaluation", "Comparing local and remote versions...");
			const localVersion = localManifest?.version;
			const remoteVersion = remoteRelease.tag_name;
			const evaluation = this.evaluateUpdateState(localVersion, remoteVersion, options);

			if (evaluation.updateAvailableDetails !== undefined) {
				const detectedUpdate: DetectedUpdate = {
					id: uuidv4(),
					repo: ctx.repo,
					version: remoteVersion,
					localVersion: localVersion ?? "unknown",
					detectedAt: Date.now(),
					releaseUrl: remoteRelease.url,
					releaseNotes: typeof remoteRelease.body === "string" ? remoteRelease.body : undefined,
				};
				this.deps.canaryStore.addDetectedUpdate(detectedUpdate);
			}

			if (evaluation.isUpdateApplicable === false) {
				if (evaluation.status === "update_available") {
					const localText = localVersion ?? "unknown";
					console.info(
						`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Update available (local: v${localText}, remote: v${remoteVersion}).`,
					);
					guard.complete(`Update available: v${localText} -> v${remoteVersion}`);
					succeeded = true;
					return {
						wasUpdated: false,
						status: "update_available",
						version: remoteVersion,
						previousVersion: localVersion,
						noUpdateAvailable: false,
						updateAvailableDetails: evaluation.updateAvailableDetails,
					};
				}

				console.info(
					`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Plugin is up to date (current: v${localVersion ?? remoteVersion}).`,
				);
				guard.complete(`Up to date (v${localVersion ?? remoteVersion})`);
				succeeded = true;
				return {
					wasUpdated: false,
					status: "up_to_date",
					version: localVersion ?? remoteVersion,
					previousVersion: localVersion,
					noUpdateAvailable: true,
				};
			}

			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			const effectiveShowChangelog = ctx.overrides?.showChangelog ?? config.showChangelog;
			const effectiveReleaseChannel = ctx.overrides?.releaseChannel ?? config.releaseChannel;
			const targetVersion = remoteRelease.tag_name;

			const changelogOptions = {
				version: targetVersion,
				releaseChannel: effectiveReleaseChannel,
				preResolvedBody: remoteRelease.body,
				showChangelog: effectiveShowChangelog,
				onChangelogReady: options.onChangelogReady,
			};

			if (effectiveShowChangelog.mode === "before") {
				activeCtx.progress("Changelog", "Awaiting changelog review...");
			}

			const shouldProceed = $(
				await this.deps.pluginChangelogService.promptChangelogBefore(activeCtx, changelogOptions),
			);
			if (shouldProceed === false) {
				console.info(`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Update review cancelled by user.`);
				guard.complete("Cancelled by user");
				succeeded = true;
				return {
					wasUpdated: false,
					status: "cancelled",
					version: targetVersion,
					previousVersion: localVersion,
				};
			}

			console.info(
				`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Downloading update assets for action '${evaluation.status}' (version: '${targetVersion}')...`,
			);
			activeCtx.progress("Download", "Downloading release update assets...");

			const prepared = $(
				await this.deps.pluginAcquisitionService.acquireRelease(activeCtx, {
					specifyVersion: options.specifyVersion,
					preResolvedRelease: { release: remoteRelease },
					onPhase: (phase): void => {
						if (phase === "downloading") {
							activeCtx.progress("Download", "Downloading update assets from GitHub...");
						} else if (phase === "finalizing") {
							activeCtx.progress("Compatibility", "Finalizing update manifest...");
						}
					},
				}),
			);

			console.info(`[Canary-Edge] [UpdateOperation] [${ctx.repo}] Deploying update files into vault...`);
			activeCtx.progress("Deployment", "Writing updated files to vault...");

			const currentSettings = $(await this.deps.settingsService.getSettingsQueued());

			$(
				await this.deps.pluginDeploymentService.deploy(activeCtx, {
					manifest: prepared.manifest,
					files: prepared.files,
					isIncompatible: prepared.isIncompatible,
					isFrozen: false,
					enableAfterInstall: options.enableAfterInstall,
					isReinstall: localManifest !== null,
					expectedVersion: currentSettings.version,
					onPhase: (phase): void => {
						if (phase === "files") {
							ctx.progress("Deployment", "Writing updated files to vault...");
						} else if (phase === "settings" || phase === "manifests") {
							ctx.progress("Configuration", "Updating plugin settings and manifest...");
						} else if (phase === "lifecycle") {
							ctx.progress("Activation", "Reloading plugin instance...");
						}
					},
				}),
			);

			this.deps.canaryStore.clearDetectedUpdates(ctx.repo);
			await this.deps.pluginChangelogService.notifyChangelogAfter(activeCtx, changelogOptions);

			const completionTelemetry = this.formatUpdateCompletionTelemetry(
				evaluation.status,
				localVersion,
				prepared.manifest.version,
			);
			console.info(`[Canary-Edge] [UpdateOperation] [${ctx.repo}] ${completionTelemetry}.`);
			guard.complete(completionTelemetry);
			succeeded = true;
			return {
				wasUpdated: true,
				status: evaluation.status,
				version: prepared.manifest.version,
				previousVersion: localVersion,
			};
		});
	}

	private evaluateUpdateState(
		localVersion: string | undefined,
		remoteVersion: string,
		options: Readonly<UpdateOptions>,
	): UpdateNeedEvaluation {
		if (localVersion === undefined) {
			if (options.seeIfUpdatedOnly === true) {
				return {
					status: "update_available",
					isUpdateApplicable: false,
					updateAvailableDetails: { local: "none", remote: remoteVersion },
				};
			}
			return {
				status: "upgraded",
				isUpdateApplicable: true,
			};
		}

		const localV = coerceVersion(localVersion, { includePrerelease: true, loose: true });
		const remoteV = coerceVersion(remoteVersion, { includePrerelease: true, loose: true });

		if (localV === null || remoteV === null) {
			if (localVersion !== remoteVersion) {
				if (options.seeIfUpdatedOnly === true) {
					return {
						status: "update_available",
						isUpdateApplicable: false,
						updateAvailableDetails: { local: localVersion, remote: remoteVersion },
					};
				}
				return {
					status: "upgraded",
					isUpdateApplicable: true,
				};
			}
			return {
				status: "up_to_date",
				isUpdateApplicable: false,
			};
		}

		const comparison = compareVersions(localV, remoteV);

		if (comparison === -1) {
			if (options.seeIfUpdatedOnly === true) {
				return {
					status: "update_available",
					isUpdateApplicable: false,
					updateAvailableDetails: { local: localVersion, remote: remoteVersion },
				};
			}
			return {
				status: "upgraded",
				isUpdateApplicable: true,
			};
		}

		if (comparison === 1) {
			if (options.forceReinstall === true) {
				return {
					status: "downgraded",
					isUpdateApplicable: true,
				};
			}
			return {
				status: "up_to_date",
				isUpdateApplicable: false,
			};
		}

		if (options.forceReinstall === true) {
			return {
				status: "reinstalled",
				isUpdateApplicable: true,
			};
		}

		return {
			status: "up_to_date",
			isUpdateApplicable: false,
		};
	}

	private formatUpdateCompletionTelemetry(
		updateStatus: PluginUpdateStatus,
		previousVersion: string | undefined,
		currentVersion: string,
	): string {
		switch (updateStatus) {
			case "upgraded": {
				const prev = previousVersion !== undefined ? `v${previousVersion} -> ` : "";
				return `Upgraded (${prev}v${currentVersion})`;
			}
			case "downgraded": {
				const prev = previousVersion !== undefined ? `v${previousVersion} -> ` : "";
				return `Downgraded (${prev}v${currentVersion})`;
			}
			case "reinstalled": {
				return `Reinstalled (v${currentVersion})`;
			}
			case "update_available": {
				return `Update available (v${currentVersion})`;
			}
			case "up_to_date": {
				return `Up to date (v${currentVersion})`;
			}
			case "cancelled": {
				return "Cancelled by user";
			}
			default: {
				const _exhaustive: never = updateStatus;
				throw new Error(`Unhandled update status: ${_exhaustive as string}`);
			}
		}
	}
}
