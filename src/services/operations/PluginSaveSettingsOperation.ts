import { safe } from "@/utils/safe";

import type { Cradle, OperationContext, SavePluginSettingsOptions } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class PluginSaveSettingsOperation {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async execute(
		ctx: OperationContext,
		options: Readonly<SavePluginSettingsOptions>,
	): Promise<Result<undefined>> {
		return ctx.safeCtx.async<undefined>(async ($inner) => {
			const { isFrozen, privateApiKeySecretId, enableAfterInstall, isIncompatible = false, overrides } = options;

			ctx.progress("Configuration", "Persisting plugin settings...");

			const settings = $inner(await this.deps.settingsService.getSettingsQueued());
			$inner(
				await this.deps.settingsService.addPluginToList(
					ctx.repo,
					{
						isFrozen,
						privateApiKeySecretId,
						isIncompatible,
						overrides,
						mergeWithExisting: false,
					},
					settings.version,
				),
			);

			const pluginIdRes = await this.deps.pluginQueryService.getPluginIdByRepo(ctx.repo);
			const pluginId = safe.unwrapOr(pluginIdRes, "");

			if (typeof pluginId === "string" && pluginId !== "") {
				ctx.progress("Lifecycle", "Updating active plugin lifecycle...");
				const wasReloaded = $inner(
					await this.deps.pluginDeploymentService.applyLifecycleState(ctx, pluginId, enableAfterInstall),
				);

				let statusText = "disabled";
				if (enableAfterInstall) {
					if (wasReloaded) {
						statusText = "reloaded";
					} else {
						statusText = "enabled";
					}
				}

				const actionCap = statusText.charAt(0).toUpperCase() + statusText.slice(1);
				this.deps.workflowNotificationPresenter.notifyUserNotice(
					`${ctx.repo} settings saved and plugin ${statusText}.`,
					{ timeout: 3 },
					$inner,
				);
				if (ctx.guard !== undefined) {
					ctx.guard.complete(`Saved & ${actionCap}`);
				}
				return undefined;
			}

			this.deps.workflowNotificationPresenter.notifyUserNotice(
				`${ctx.repo} settings saved.`,
				{ timeout: 3 },
				$inner,
			);
			if (ctx.guard !== undefined) {
				ctx.guard.complete("Saved");
			}
			return undefined;
		});
	}
}