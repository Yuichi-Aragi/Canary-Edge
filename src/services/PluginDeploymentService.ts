import { isCanaryEdge } from "@/domain/schemas";

import type { Cradle, DeploymentOptions, OperationContext } from "@/domain/types";
import type { Result } from "@/utils/safe";

export type DeploymentPhase = "files" | "settings" | "manifests" | "lifecycle";

export interface ExtendedDeploymentOptions extends DeploymentOptions {
	readonly onPhase?: ((phase: DeploymentPhase) => void) | undefined;
}

export class PluginDeploymentService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async applyLifecycleState(
		ctx: OperationContext,
		pluginId: string,
		enable: boolean,
	): Promise<Result<boolean>> {
		return await ctx.safeCtx.async<boolean>(async ($) => {
			$.checkpoint();
			const ownManifestId = this.deps.plugin.manifest.id;
			const isTargetCanaryEdge =
				isCanaryEdge(pluginId, ownManifestId) === true || isCanaryEdge(ctx.repo, ownManifestId) === true;

			if (isTargetCanaryEdge === true) {
				console.info(`[Canary-Edge] [Deployment] [${pluginId}] Waiting for concurrent operations before self-reload...`);
				$(await this.deps.concurrencyService.waitForOtherRepoOperations(ctx.repo, ctx.signal));
			}

			const internalPlugins = $(this.deps.pluginLifecycle.getInternalPlugins());
			const isCurrentlyEnabled = Object.hasOwn(internalPlugins.plugins, pluginId);

			if (enable === true) {
				if (isCurrentlyEnabled === true) {
					console.info(`[Canary-Edge] [Deployment] [${pluginId}] Reloading active plugin instance...`);
					$(await this.deps.pluginLifecycle.reloadPlugin(pluginId, ctx));
					return true;
				}
				console.info(`[Canary-Edge] [Deployment] [${pluginId}] Enabling plugin and persisting state...`);
				$(await this.deps.pluginLifecycle.enablePluginAndSave(pluginId, ctx));
				return false;
			}

			console.info(`[Canary-Edge] [Deployment] [${pluginId}] Disabling plugin and persisting state...`);
			$(await this.deps.pluginLifecycle.disablePluginAndSave(pluginId, ctx));
			return false;
		});
	}

	public async deploy(
		ctx: OperationContext,
		options: Readonly<ExtendedDeploymentOptions>,
	): Promise<Result<undefined>> {
		return await ctx.safeCtx.async<undefined>(async ($) => {
			$.checkpoint();
			const {
				manifest,
				files,
				isIncompatible,
				isFrozen,
				enableAfterInstall,
				isReinstall,
				expectedVersion,
				onPhase,
			} = options;

			if (onPhase !== undefined) {
				onPhase("files");
			}

			console.info(`[Canary-Edge] [Deployment] [${ctx.repo}] Writing release assets for plugin '${manifest.id}'...`);
			$(await this.deps.pluginInstaller.writeReleaseFilesToPluginFolder(manifest.id, files, ctx.safeCtx));

			if (onPhase !== undefined) {
				onPhase("settings");
			}

			console.info(`[Canary-Edge] [Deployment] [${ctx.repo}] Persisting plugin configuration to settings store...`);
			$(
				await this.deps.settingsService.upsertPlugin(
					ctx.repo,
					{
						isFrozen,
						privateApiKeySecretId: ctx.secretId,
						isIncompatible,
						preserveFrozenStatus: isReinstall,
						overrides: ctx.overrides,
					},
					expectedVersion,
				),
			);

			if (onPhase !== undefined) {
				onPhase("manifests");
			}

			console.info(`[Canary-Edge] [Deployment] [${ctx.repo}] Triggering Obsidian plugin manifest refresh...`);
			$(await this.deps.pluginLifecycle.loadManifests(ctx));

			if (onPhase !== undefined) {
				onPhase("lifecycle");
			}

			$(await this.applyLifecycleState(ctx, manifest.id, enableAfterInstall));

			return undefined;
		});
	}
}
