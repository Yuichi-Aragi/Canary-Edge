import type { Cradle, OperationContext } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class PluginDeleteOperation {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async execute(ctx: OperationContext): Promise<Result<undefined>> {
		return ctx.safeCtx.async<undefined>(async ($inner) => {
			ctx.progress("Removal", "Removing plugin from configuration...");

			const exists = $inner(this.deps.settingsService.existPluginInList(ctx.repo));
			if (exists) {
				const settings = $inner(await this.deps.settingsService.getSettingsQueued());
				$inner(await this.deps.settingsService.removePluginFromList(ctx.repo, settings.version));
				this.deps.workflowNotificationPresenter.notifyUserNotice(
					`Removed '${ctx.repo}' from Canary Edge list.`,
					{ timeout: 3 },
					$inner,
				);
			}

			ctx.progress("Cleanup", "Cleaning up tracked state...");
			if (ctx.guard !== undefined) {
				ctx.guard.complete("Deleted");
			}
			return undefined;
		});
	}
}
