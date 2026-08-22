import type { Cradle, OperationContext, ReleaseChannel } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class PluginRegisterOperation {
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
		options: Readonly<{ readonly releaseChannel?: ReleaseChannel | undefined }>,
	): Promise<Result<boolean>> {
		return ctx.safeCtx.async<boolean>(async ($inner) => {
			const { releaseChannel } = options;
			ctx.progress("Registration", "Awaiting registration confirmation...");

			const confirmRes = await this.deps.uiService.confirmOverride({
				type: "register",
				repo: ctx.repo,
				channel: releaseChannel,
			});

			if (!confirmRes.ok) {
				console.error(
					`[Canary-Edge] [Workflow] Registration confirmation rejected or failed for '${ctx.repo}':`,
					confirmRes.error,
				);
				throw confirmRes.error;
			}

			if (!confirmRes.value) {
				if (ctx.guard !== undefined) {
					ctx.guard.complete("Cancelled by user");
				}
				return false;
			}

			ctx.progress("Configuration", "Writing plugin registration to settings...");

			const settings = $inner(await this.deps.settingsService.getSettingsQueued());

			$inner(
				await this.deps.settingsService.upsertPlugin(
					ctx.repo,
					{
						isFrozen: false,
						overrides: ctx.overrides,
						mergeWithExisting: true,
					},
					settings.version,
				),
			);

			const successMsg = `Plugin '${ctx.repo}' successfully registered in Canary Edge.`;
			this.deps.workflowNotificationPresenter.notifyUserNotice(successMsg, { timeout: 4 }, $inner);

			if (ctx.guard !== undefined) {
				ctx.guard.complete("Registered");
			}
			return true;
		});
	}
}
