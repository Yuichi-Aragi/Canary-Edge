import PQueue from "p-queue";

import { ERROR_MESSAGES } from "@/domain/errorMessages";
import { isConnectedToInternet } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { Cradle, NotificationHandle, PluginListItem } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class PluginUpdateOrchestrator {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async checkForPluginUpdatesAndInstallUpdates(
		showInfo = false,
		onlyCheckDontUpdate = false,
		isLoadCheck = false,
		isManual = false,
	): Promise<Result<undefined>> {
		return await this.safeCtx.async<undefined>(async ($) => {
			$.checkpoint();
			if (this.deps.plugin.app.workspace.layoutReady === false) {
				console.info("[Canary-Edge] [Orchestrator] Update check deferred: Vault workspace layout is not ready.");
				return undefined;
			}

			const effectiveIsManual = isManual === true || showInfo === true;
			const eligiblePlugins = $(this.getEligiblePlugins(showInfo, isLoadCheck, effectiveIsManual));

			if (eligiblePlugins.length === 0) {
				$(this.notifyAndLog("No plugins eligible for update.", "info", showInfo, 3));
				return undefined;
			}

			const isConnected = safe.unwrapOr(
				await safe.tryAsync((): Promise<boolean> => {
					return isConnectedToInternet();
				}),
				false,
			);
			if (isConnected === false) {
				console.error(`[Canary-Edge] [Orchestrator] Network check failed: ${ERROR_MESSAGES.OFFLINE}`);
				$(this.notifyAndLog(ERROR_MESSAGES.OFFLINE, "error", showInfo, 5));
				return undefined;
			}

			$(await this.executeBatchUpdate(eligiblePlugins, showInfo, onlyCheckDontUpdate, isLoadCheck, effectiveIsManual));
			return undefined;
		});
	}

	private getEligiblePlugins(showInfo: boolean, isLoadCheck: boolean, isManual: boolean): Result<PluginListItem[]> {
		return this.safeCtx(($): PluginListItem[] => {
			$.checkpoint();
			const plugins = $(this.deps.pluginQueryService.getUpdatablePlugins());
			if (isManual === true || showInfo === true) {
				return plugins;
			}

			return plugins.filter((p): boolean => {
				const config = $(this.deps.settingsService.getPluginConfiguration(p.repo));
				if (isLoadCheck === true) {
					return config.updateCheckOnLoad.enabled;
				}
				if (config.updateInterval.value === false) {
					return false;
				}
				return $(this.deps.pluginQueryService.isEligibleForAutoUpdate(p.repo, config));
			});
		});
	}

	private notifyAndLog(
		message: string,
		level: "info" | "error",
		showInfo: boolean,
		timeout: number,
	): Result<undefined> {
		return this.safeCtx(($): undefined => {
			if (level === "error") {
				console.warn(`[Canary-Edge] [Orchestrator] ${message}`);
			} else {
				console.info(`[Canary-Edge] [Orchestrator] ${message}`);
			}

			if (showInfo === true) {
				const notificationLevel = level === "error" ? "error" : "info";
				$(this.deps.notificationService.show(message, { timeout }, notificationLevel));
			}
			return undefined;
		});
	}

	private async executeBatchUpdate(
		eligiblePlugins: readonly PluginListItem[],
		showInfo: boolean,
		onlyCheckDontUpdate: boolean,
		isLoadCheck: boolean,
		isManual: boolean,
	): Promise<Result<undefined>> {
		return await this.safeCtx.async<undefined>(async ($, defer) => {
			$.checkpoint();
			const totalCount = eligiblePlugins.length;
			const modeLabel = onlyCheckDontUpdate === true ? "Checking for updates" : "Updating plugins";

			console.info(
				`[Canary-Edge] [Orchestrator] Starting batch operation '${modeLabel}' for ${String(totalCount)} plugins...`,
			);

			let progressHandle: NotificationHandle | undefined;
			let isBatchActive = true;

			if (showInfo === true) {
				const initialRes = this.deps.notificationService.show(
					`${modeLabel} (0/${String(totalCount)})...`,
					{ timeout: 0 },
					"info",
				);
				if (initialRes.ok === true) {
					progressHandle = initialRes.value;
				}
			}

			defer((): void => {
				isBatchActive = false;
				if (progressHandle !== undefined) {
					safe.unwrapOr(progressHandle.hide(), undefined);
				}
			});

			let completedCount = 0;
			let updatedCount = 0;
			let upToDateCount = 0;
			let failureCount = 0;
			const activeRepos = new Set<string>();

			const updateProgressNotice = (): void => {
				if (isBatchActive === true && progressHandle !== undefined && totalCount > 0 && this.disposed === false) {
					const percent = Math.round((completedCount / totalCount) * 100);
					const activeList = Array.from(activeRepos).slice(0, 2).join(", ");
					const activeLine = activeList !== "" ? `\nProcessing: ${activeList}` : "";
					const metricLabel = onlyCheckDontUpdate === true ? "Available" : "Updated";

					const statusText = `${modeLabel} [${String(percent)}%] (${String(completedCount)}/${String(totalCount)})\n${metricLabel}: ${String(updatedCount)} | Current: ${String(upToDateCount)} | Failed: ${String(failureCount)}${activeLine}`;

					safe.unwrapOr(progressHandle.updateMessage(statusText), undefined);
				}
			};

			const batchQueue = new PQueue({ concurrency: 3 });

			await Promise.allSettled(
				eligiblePlugins.map((bp): Promise<void> => {
					return batchQueue.add(async (): Promise<void> => {
						if (isBatchActive === false || this.disposed === true) {
							return;
						}

						activeRepos.add(bp.repo);
						updateProgressNotice();

						console.info(`[Canary-Edge] [Orchestrator] [${bp.repo}] Starting bulk update pipeline...`);

						const taskResult = await safe.async<undefined>(async ($inner, deferInner) => {
							$inner.checkpoint();
							deferInner((): void => {
								activeRepos.delete(bp.repo);
								completedCount = completedCount + 1;
								updateProgressNotice();
							});

							const config = $inner(this.deps.settingsService.getPluginConfiguration(bp.repo));
							const autoDownloadSetting =
								isLoadCheck === true ? config.updateCheckOnLoad.autoDownload : config.updateInterval.autoDownload;

							const shouldOnlyCheck =
								isManual === true || showInfo === true
									? onlyCheckDontUpdate
									: onlyCheckDontUpdate === true || autoDownloadSetting === false;

							const updateRes = await this.deps.pluginWorkflowService.updatePlugin({
								repositoryPath: bp.repo,
								onlyCheckDontUpdate: shouldOnlyCheck,
								reportIfNotUpdated: false,
								forceReinstall: false,
								privateApiKeySecretId: bp.tokenSecretId ?? "",
								skipNetworkCheck: true,
								priority: 0,
								isBulk: true,
							});

							if (updateRes.ok === false) {
								failureCount = failureCount + 1;
								console.error(`[Canary-Edge] [Orchestrator] [${bp.repo}] Bulk update failed:`, updateRes.error);
								return undefined;
							}

							const outcome = updateRes.value;

							if (shouldOnlyCheck === true) {
								if (outcome.status === "update_available") {
									updatedCount = updatedCount + 1;
									console.info(
										`[Canary-Edge] [Orchestrator] [${bp.repo}] Update available (v${outcome.updateAvailableDetails?.local ?? "current"} -> v${outcome.updateAvailableDetails?.remote ?? "latest"}).`,
									);
								} else {
									upToDateCount = upToDateCount + 1;
									console.info(`[Canary-Edge] [Orchestrator] [${bp.repo}] Plugin is up to date.`);
								}
							} else if (outcome.wasUpdated === true) {
								updatedCount = updatedCount + 1;
								console.info(
									`[Canary-Edge] [Orchestrator] [${bp.repo}] Plugin ${outcome.status} successfully to v${outcome.version ?? "unknown"}.`,
								);
							} else {
								upToDateCount = upToDateCount + 1;
								console.info(`[Canary-Edge] [Orchestrator] [${bp.repo}] Plugin is up to date.`);
							}

							const settings = $inner(await this.deps.settingsService.getSettingsQueued());
							$inner(await this.deps.settingsService.updateLastUpdateCheck(bp.repo, settings.version));
							return undefined;
						});

						if (taskResult.ok === false) {
							failureCount = failureCount + 1;
							console.error(
								`[Canary-Edge] [Orchestrator] [${bp.repo}] Unexpected bulk update exception:`,
								taskResult.error,
							);
						}
					});
				}),
			);

			if (this.disposed === false) {
				$(this.reportResults(updatedCount, upToDateCount, failureCount, showInfo, onlyCheckDontUpdate));
			}
			return undefined;
		});
	}

	private reportResults(
		updatedCount: number,
		upToDateCount: number,
		failureCount: number,
		showInfo: boolean,
		onlyCheckDontUpdate: boolean,
	): Result<undefined> {
		return this.safeCtx(($): undefined => {
			const finalMsg = this.formatResultMessage(updatedCount, upToDateCount, failureCount, onlyCheckDontUpdate);

			console.info(`[Canary-Edge] [Orchestrator] ${finalMsg}`);

			if (showInfo === true) {
				const level = failureCount > 0 ? "warn" : "info";
				$(this.deps.notificationService.show(finalMsg, { timeout: 5 }, level));
			}
			return undefined;
		});
	}

	private formatResultMessage(
		updated: number,
		upToDate: number,
		failed: number,
		onlyCheck: boolean,
	): string {
		if (failed === 0 && updated === 0) {
			return "All plugins are up to date.";
		}

		if (onlyCheck === true) {
			const failPart = failed > 0 ? `, ${String(failed)} failed.` : ".";
			return `Update check completed: ${String(updated)} updates available (${String(upToDate)} up to date)${failPart}`;
		}

		if (failed > 0) {
			return `Batch update finished: ${String(updated)} updated, ${String(upToDate)} current, ${String(failed)} failed.`;
		}

		return `Successfully updated ${String(updated)} plugins (${String(upToDate)} up to date).`;
	}
}
