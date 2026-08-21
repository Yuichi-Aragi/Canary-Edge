import { safe } from "@/utils/safe";

import type { Cradle, InstallOperationResult, UpdateOperationResult } from "@/domain/types";
import type { Result, Unwrapper } from "@/utils/safe";

export class WorkflowNotificationPresenter {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public notifyInstallResult(
		repo: string,
		result: Readonly<InstallOperationResult>,
		effectiveEnableAfterInstall: boolean,
		$inner: Unwrapper<Error>,
	): void {
		const { action, version, previousVersion } = result;

		switch (action) {
			case "installed": {
				let installMsg = `${repo} (v${version})\nSuccessfully installed.`;
				if (effectiveEnableAfterInstall === false) {
					installMsg = `${installMsg} Enable it in Community Plugins.`;
				}
				this.notifyUserNotice(installMsg, {}, $inner);
				break;
			}
			case "reinstalled": {
				const reinstallMsg = `${repo} (v${version})\nSuccessfully reinstalled.`;
				this.notifyUserNotice(reinstallMsg, {}, $inner);
				break;
			}
			case "upgraded": {
				const prevStr = previousVersion !== undefined ? `v${previousVersion}` : "previous version";
				const upgradeMsg = `${repo}\nSuccessfully upgraded from ${prevStr} to v${version}.`;
				this.notifyUserNotice(upgradeMsg, {}, $inner);
				break;
			}
			case "downgraded": {
				const prevStr = previousVersion !== undefined ? `v${previousVersion}` : "newer version";
				const downgradeMsg = `${repo}\nSuccessfully downgraded from ${prevStr} to v${version}.`;
				this.notifyUserNotice(downgradeMsg, {}, $inner);
				break;
			}
			case "unchanged": {
				const unchangedMsg = `${repo} (v${version}) is already installed and up to date.`;
				this.notifyUserNotice(unchangedMsg, { timeout: 3 }, $inner);
				break;
			}
			default: {
				const _exhaustive: never = action;
				throw new Error(`Unhandled install action: ${_exhaustive as string}`);
			}
		}
	}

	public notifyUpdateResult(
		repo: string,
		result: Readonly<UpdateOperationResult>,
		reportIfNotUpdated: boolean,
		$inner: Unwrapper<Error>,
	): void {
		const { status: updateStatus, version, previousVersion, updateAvailableDetails } = result;

		switch (updateStatus) {
			case "up_to_date": {
				if (reportIfNotUpdated === true) {
					console.info(`[Canary-Edge] [Workflow] No update available for '${repo}'`);
					$inner(
						this.deps.notificationService.show(
							`No update available for ${repo} (v${version ?? "latest"})`,
							{ timeout: 3 },
							"info",
						),
					);
				}
				break;
			}
			case "update_available": {
				if (updateAvailableDetails !== undefined) {
					const { local, remote } = updateAvailableDetails;
					const updateAvailableMsg = `Update available for ${repo}: ${local} -> ${remote}`;
					const url = `https://github.com/${repo}/releases/tag/${remote}`;
					console.info(`[Canary-Edge] [Workflow] ${updateAvailableMsg} (Release Info: ${url})`);
					$inner(
						this.deps.notificationService.show(
							updateAvailableMsg,
							{
								timeout: 30,
								contextMenuCallback: (): void => {
									window.open(url);
								},
							},
							"info",
						),
					);
				}
				break;
			}
			case "upgraded": {
				if (version !== undefined) {
					const prevStr = previousVersion !== undefined ? `v${previousVersion}` : "previous version";
					const updateSuccessMsg = `${repo}\nSuccessfully upgraded from ${prevStr} to v${version}.`;
					this.notifyUserNotice(updateSuccessMsg, {}, $inner);
				}
				break;
			}
			case "downgraded": {
				if (version !== undefined) {
					const prevStr = previousVersion !== undefined ? `v${previousVersion}` : "newer version";
					const downgradeMsg = `${repo}\nSuccessfully downgraded from ${prevStr} to v${version}.`;
					this.notifyUserNotice(downgradeMsg, {}, $inner);
				}
				break;
			}
			case "reinstalled": {
				if (version !== undefined) {
					const reinstallMsg = `${repo} (v${version})\nSuccessfully reinstalled.`;
					this.notifyUserNotice(reinstallMsg, {}, $inner);
				}
				break;
			}
			case "cancelled": {
				break;
			}
			default: {
				const _exhaustive: never = updateStatus;
				throw new Error(`Unhandled update status: ${_exhaustive as string}`);
			}
		}
	}

	public notifyUserNotice(
		message: string,
		options: Readonly<Record<string, unknown>> = {},
		$inner?: Unwrapper<Error>,
	): void {
		console.info(`[Canary-Edge] [Workflow] ${message}`);
		const showResult = this.deps.notificationService.show(message, options, "info");
		if ($inner !== undefined) {
			$inner(showResult);
		}
	}

	public handleWorkflowError(repo: string, error: unknown, context = "Operation failed"): Result<undefined> {
		return this.safeCtx(($): undefined => {
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.startsWith("Busy:") === true) {
				console.warn(`[Canary-Edge] [Workflow] Operation deferred (busy): ${errorMessage}`);
				return undefined;
			}

			console.error(`[Canary-Edge] [Workflow] ${context} for '${repo}':`, error);
			$(this.deps.notificationService.show(error, { context: `${context} for ${repo}:` }, "error"));
			return undefined;
		});
	}

	public processOperationResult<T>(
		scrubbedRepo: string,
		resultObj: Readonly<Result<T>>,
		failureContext: string,
		$inner: Unwrapper<Error>,
	): T {
		if (resultObj.ok === false) {
			this.deps.operationTrackingService.fail(scrubbedRepo, resultObj.error);
			$inner(this.handleWorkflowError(scrubbedRepo, resultObj.error, failureContext));
			const err = resultObj.error instanceof Error ? resultObj.error : new Error(String(resultObj.error));
			throw err;
		}
		return resultObj.value;
	}
}
