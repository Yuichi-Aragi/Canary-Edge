import { ERROR_MESSAGES } from "@/domain/errorMessages";
import { createOperationContext } from "@/services/OperationContext";
import { validateRepositoryIdentifier } from "@/utils/contextUtils";
import { isConnectedToInternet } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type {
	AddPluginOptions,
	Cradle,
	InstallOperationResult,
	OperationContext,
	OverrideRequest,
	SavePluginSettingsOptions,
	UpdateOperationResult,
	UpdatePluginOptions,
} from "@/domain/types";
import type { Result, Unwrapper } from "@/utils/safe";

interface ExecuteInstallParams {
	readonly ctx: OperationContext;
	readonly specifyVersion: string;
	readonly forceReinstall: boolean;
	readonly effectiveEnableAfterInstall: boolean;
	readonly isFrozen: boolean;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
	readonly $inner: Unwrapper<Error>;
}

interface ExecuteUpdateParams {
	readonly ctx: OperationContext;
	readonly specifyVersion: string;
	readonly effectiveEnableAfterInstall: boolean;
	readonly seeIfUpdatedOnly: boolean;
	readonly reportIfNotUpdated: boolean;
	readonly forceReinstall: boolean;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
	readonly $inner: Unwrapper<Error>;
}

export class PluginWorkflowService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public cancelOperation(repositoryPath: string): Result<undefined> {
		return this.safeCtx(($): undefined => {
			const scrubbed = scrubRepositoryUrl(repositoryPath);
			$(this.deps.cancellationService.cancel(scrubbed));
			this.deps.operationTrackingService.fail(scrubbed, new Error("Operation explicitly cancelled by user"));
			return undefined;
		});
	}

	public cancelAllOperations(): Result<undefined> {
		return this.safeCtx(($): undefined => {
			$(this.deps.cancellationService.cancelAllActiveOperations());
			$(this.deps.uiService.dismissPromptsForRepo(""));
			this.deps.canaryStore.dismissAllPrompts();
			return undefined;
		});
	}

	public async addPlugin(options: Readonly<AddPluginOptions>): Promise<Result<InstallOperationResult>> {
		const safeCtx = safe.from(options.signal).bind(this);
		return safeCtx.async<InstallOperationResult>(async ($) => {
			const {
				repositoryPath,
				specifyVersion = "",
				forceReinstall = false,
				enableAfterInstall,
				privateApiKeySecretId = "",
				isFrozen = false,
				onChangelogReady,
				overrides,
				signal: providedSignal,
				priority,
				isBulk = false,
			} = options;

			const scrubbedRepo = this.validateRepoOrThrow(repositoryPath, $);

			const signal = providedSignal ?? this.deps.cancellationService.register(scrubbedRepo, "install");
			const finalSecretId = $(this.deps.settingsService.resolveTokenSecretId(scrubbedRepo, privateApiKeySecretId));
			const effectiveToken = $(this.deps.settingsService.getEffectiveToken(finalSecretId));

			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "install",
				signal,
				token: effectiveToken,
				secretId: finalSecretId,
				overrides,
				onOverrideRequest: this.createOverrideHandler(),
				priority,
				isBulk,
			});

			return $(
				await this.deps.concurrencyService.schedule(
					ctx.repo,
					ctx.operationType,
					async (): Promise<Result<InstallOperationResult>> => {
						return ctx.safeCtx.async<InstallOperationResult>(async ($inner, defer) => {
							let taskSucceeded = false;
							const guard = this.deps.operationTrackingService.createScopeGuard(
								ctx.repo,
								ctx.operationType,
								"Operation failed or rejected",
								providedSignal === undefined,
							);
							const activeCtx = ctx.withGuard(guard);

							defer((): void => {
								guard.cleanup(taskSucceeded);
							});

							const config = $inner(this.deps.settingsService.getPluginConfiguration(ctx.repo));
							const effectiveEnableAfterInstall =
								enableAfterInstall ?? overrides?.autoEnable ?? config.autoEnable;

							const installResult = await this.executeInstallOperation({
								ctx: activeCtx,
								specifyVersion,
								forceReinstall,
								effectiveEnableAfterInstall,
								isFrozen,
								onChangelogReady,
								$inner,
							});

							taskSucceeded = true;
							return installResult;
						});
					},
					{ priority: ctx.priority, isBulk: ctx.isBulk, signal: ctx.signal },
				),
			);
		});
	}

	public async updatePlugin(options: Readonly<UpdatePluginOptions>): Promise<Result<UpdateOperationResult>> {
		const safeCtx = safe.from(options.signal).bind(this);
		return safeCtx.async<UpdateOperationResult>(async ($) => {
			const {
				repositoryPath,
				onlyCheckDontUpdate = false,
				reportIfNotUpdated = false,
				forceReinstall = false,
				privateApiKeySecretId = "",
				skipNetworkCheck = false,
				onChangelogReady,
				signal: providedSignal,
				priority,
				isBulk = false,
			} = options;

			const scrubbedRepo = scrubRepositoryUrl(repositoryPath);

			if (!this.deps.plugin.app.workspace.layoutReady) {
				const layoutMsg = `[Canary-Edge] Update check for ${scrubbedRepo} skipped: Layout not ready`;
				console.warn(layoutMsg);
				throw new Error(layoutMsg);
			}

			if (!skipNetworkCheck) {
				const isConnected = safe.unwrapOr(
					await safe.tryAsync((): Promise<boolean> => {
						return isConnectedToInternet();
					}),
					false,
				);
				if (!isConnected) {
					console.error(`[Canary-Edge] Network connectivity check failed: ${ERROR_MESSAGES.OFFLINE}`);
					$(this.deps.notificationService.show(ERROR_MESSAGES.OFFLINE, { timeout: 5 }, "error"));
					throw new Error(ERROR_MESSAGES.OFFLINE);
				}
			}

			const targetVersion = "latest";
			const effectiveSecretId = $(
				this.deps.settingsService.resolveTokenSecretId(scrubbedRepo, privateApiKeySecretId),
			);
			const effectiveToken = $(this.deps.settingsService.getEffectiveToken(effectiveSecretId));
			const signal = providedSignal ?? this.deps.cancellationService.register(scrubbedRepo, "update");

			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "update",
				signal,
				token: effectiveToken,
				secretId: effectiveSecretId,
				onOverrideRequest: this.createOverrideHandler(),
				priority,
				isBulk,
			});

			return $(
				await this.deps.concurrencyService.schedule(
					ctx.repo,
					ctx.operationType,
					async (): Promise<Result<UpdateOperationResult>> => {
						return ctx.safeCtx.async<UpdateOperationResult>(async ($inner, defer) => {
							let taskSucceeded = false;
							const guard = this.deps.operationTrackingService.createScopeGuard(
								ctx.repo,
								ctx.operationType,
								"Update operation failed",
								providedSignal === undefined,
							);
							const activeCtx = ctx.withGuard(guard);

							defer((): void => {
								guard.cleanup(taskSucceeded);
							});

							const config = $inner(this.deps.settingsService.getPluginConfiguration(ctx.repo));
							const effectiveEnableAfterInstall = config.autoEnable;

							const updateResult = await this.executeUpdateOperation({
								ctx: activeCtx,
								specifyVersion: targetVersion,
								effectiveEnableAfterInstall,
								seeIfUpdatedOnly: onlyCheckDontUpdate,
								reportIfNotUpdated,
								forceReinstall,
								onChangelogReady,
								$inner,
							});

							taskSucceeded = true;
							return updateResult;
						});
					},
					{ priority: ctx.priority, isBulk: ctx.isBulk, signal: ctx.signal },
				),
			);
		});
	}

	public async deletePlugin(repositoryPath: string): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			const scrubbedRepo = scrubRepositoryUrl(repositoryPath);
			const signal = this.deps.cancellationService.register(scrubbedRepo, "delete");
			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "delete",
				signal,
				priority: 100,
			});

			$(
				await this.deps.concurrencyService.schedule(
					ctx.repo,
					ctx.operationType,
					async (): Promise<Result<undefined>> => {
						return ctx.safeCtx.async<undefined>(async (_$inner, defer) => {
							let taskSucceeded = false;
							const guard = this.deps.operationTrackingService.createScopeGuard(
								ctx.repo,
								ctx.operationType,
								"Delete operation failed or cancelled",
							);
							const activeCtx = ctx.withGuard(guard);

							defer((): void => {
								guard.cleanup(taskSucceeded);
							});

							$(await this.deps.pluginDeleteOperation.execute(activeCtx));

							taskSucceeded = true;
							return undefined;
						});
					},
					{ priority: ctx.priority, signal: ctx.signal },
				),
			);
			return undefined;
		});
	}

	public async savePluginSettings(options: Readonly<SavePluginSettingsOptions>): Promise<Result<undefined>> {
		const safeCtx = safe.from(options.signal).bind(this);
		return safeCtx.async<undefined>(async ($) => {
			const { repositoryPath, privateApiKeySecretId, overrides, signal: providedSignal, priority = 10 } = options;

			const scrubbedRepo = scrubRepositoryUrl(repositoryPath);

			const signal = providedSignal ?? this.deps.cancellationService.register(scrubbedRepo, "settings");
			const ctx = createOperationContext({
				repo: scrubbedRepo,
				operationType: "settings",
				signal,
				secretId: privateApiKeySecretId,
				overrides,
				priority,
			});

			$(
				await this.deps.concurrencyService.schedule(
					ctx.repo,
					ctx.operationType,
					async (): Promise<Result<undefined>> => {
						return ctx.safeCtx.async<undefined>(async (_$inner, defer) => {
							let taskSucceeded = false;
							const guard = this.deps.operationTrackingService.createScopeGuard(
								ctx.repo,
								ctx.operationType,
								"Save settings failed",
							);
							const activeCtx = ctx.withGuard(guard);

							defer((): void => {
								guard.cleanup(taskSucceeded);
							});

							$(await this.deps.pluginSaveSettingsOperation.execute(activeCtx, options));

							taskSucceeded = true;
							return undefined;
						});
					},
					{ priority: ctx.priority, signal: ctx.signal },
				),
			);
			return undefined;
		});
	}

	private validateRepoOrThrow(repositoryPath: string, $: Unwrapper<Error>): string {
		const { isValid, scrubbed } = validateRepositoryIdentifier(repositoryPath);
		if (!isValid) {
			const errMsg = `Invalid repository format: '${repositoryPath}'. Must be in 'owner/repo' format.`;
			console.warn(`[Canary-Edge] [Workflow] Validation rejected repository identifier: '${repositoryPath}'`);
			$(this.deps.notificationService.show(errMsg, {}, "warn"));
			throw new Error(errMsg);
		}
		return scrubbed;
	}

	private async executeInstallOperation(
		params: Readonly<ExecuteInstallParams>,
	): Promise<InstallOperationResult> {
		const {
			ctx,
			specifyVersion,
			forceReinstall,
			effectiveEnableAfterInstall,
			isFrozen,
			onChangelogReady,
			$inner,
		} = params;

		const installResObj = await this.deps.pluginInstallOperation.execute(ctx, {
			specifyVersion,
			forceReinstall,
			enableAfterInstall: effectiveEnableAfterInstall,
			isFrozen,
			onChangelogReady,
		});

		const installRes = this.deps.workflowNotificationPresenter.processOperationResult(
			ctx.repo,
			installResObj,
			"Installation failed",
			$inner,
		);

		this.deps.workflowNotificationPresenter.notifyInstallResult(
			ctx.repo,
			installRes,
			effectiveEnableAfterInstall,
			$inner,
		);

		return installRes;
	}

	private async executeUpdateOperation(
		params: Readonly<ExecuteUpdateParams>,
	): Promise<UpdateOperationResult> {
		const {
			ctx,
			specifyVersion,
			effectiveEnableAfterInstall,
			seeIfUpdatedOnly,
			reportIfNotUpdated,
			forceReinstall,
			onChangelogReady,
			$inner,
		} = params;

		const updateResObj = await this.deps.pluginUpdateOperation.execute(ctx, {
			specifyVersion,
			enableAfterInstall: effectiveEnableAfterInstall,
			seeIfUpdatedOnly,
			reportIfNotUpdated,
			forceReinstall,
			onChangelogReady,
		});

		const updateRes = this.deps.workflowNotificationPresenter.processOperationResult(
			ctx.repo,
			updateResObj,
			"Update failed",
			$inner,
		);

		this.deps.workflowNotificationPresenter.notifyUpdateResult(
			ctx.repo,
			updateRes,
			reportIfNotUpdated,
			$inner,
		);

		return updateRes;
	}

	private createOverrideHandler(): (request: Readonly<OverrideRequest>) => Promise<Result<boolean>> {
		return async (request: Readonly<OverrideRequest>): Promise<Result<boolean>> => {
			return this.deps.uiService.confirmOverride(request);
		};
	}
}