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
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async applyLifecycleState(
		ctx: OperationContext,
		pluginId: string,
		enable: boolean,
	): Promise<Result<boolean>> {
		return ctx.safeCtx.async<boolean>(async ($) => {
			$.checkpoint();
			const ownManifestId = this.deps.plugin.manifest.id;
			const isTargetCanaryEdge =
				isCanaryEdge(pluginId, ownManifestId) || isCanaryEdge(ctx.repo, ownManifestId);

			if (isTargetCanaryEdge) {
				$(await this.deps.concurrencyService.waitForOtherRepoOperations(ctx.repo, ctx.signal));
			}

			const internalPlugins = $(this.deps.pluginLifecycle.getInternalPlugins());
			const isCurrentlyEnabled = Object.hasOwn(internalPlugins.plugins, pluginId);

			if (enable) {
				if (isCurrentlyEnabled) {
					$(await this.deps.pluginLifecycle.reloadPlugin(pluginId, ctx));
					return true;
				}
				$(await this.deps.pluginLifecycle.enablePluginAndSave(pluginId, ctx));
				return false;
			}

			$(await this.deps.pluginLifecycle.disablePluginAndSave(pluginId, ctx));
			return false;
		});
	}

	public async deploy(
		ctx: OperationContext,
		options: Readonly<ExtendedDeploymentOptions>,
	): Promise<Result<undefined>> {
		return ctx.safeCtx.async<undefined>(async ($) => {
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

			$(await this.deps.pluginInstaller.writeReleaseFilesToPluginFolder(manifest.id, files, ctx.safeCtx));

			if (onPhase !== undefined) {
				onPhase("settings");
			}

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

			$(await this.deps.pluginLifecycle.loadManifests(ctx));

			if (onPhase !== undefined) {
				onPhase("lifecycle");
			}

			$(await this.applyLifecycleState(ctx, manifest.id, enableAfterInstall));

			return undefined;
		});
	}
}
