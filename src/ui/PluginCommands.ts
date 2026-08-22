import { Notice } from "obsidian";

import { safe } from "@/utils/safe";

import type { Cradle } from "@/domain/types";
import type { Result } from "@/utils/safe";

interface CommandDefinition {
	readonly id: string;
	readonly icon: string;
	readonly name: string;
	readonly showInRibbon: boolean;
	readonly callback: () => Result<undefined> | Promise<Result<undefined>>;
}

const COMMAND_CHECK_AND_UPDATE_ID = "canaryCheckForUpdatesAndUpdate" as const;
const COMMAND_CHECK_AND_UPDATE_NAME = "Check for updates and install updates for all active tracked plugins" as const;
const COMMAND_CHECK_AND_UPDATE_ICON = "refresh-cw" as const;

const COMMAND_CHECK_ONLY_ID = "canaryCheckForUpdatesAndDontUpdate" as const;
const COMMAND_CHECK_ONLY_NAME = "Check for updates without installing for all active tracked plugins" as const;
const COMMAND_CHECK_ONLY_ICON = "search" as const;

const COMMAND_INSTALL_UNTRACKED_ID = "canaryOpenInstallUntrackedPluginPanel" as const;
const COMMAND_INSTALL_UNTRACKED_NAME = "Open panel to install new untracked plugin" as const;
const COMMAND_INSTALL_UNTRACKED_ICON = "plus" as const;

const COMMAND_TOGGLE_CE_ID = "canaryToggleCEWindow" as const;
const COMMAND_TOGGLE_CE_NAME = "Open CE Window" as const;
const COMMAND_TOGGLE_CE_ICON = "gear" as const;

const NOTICE_UPDATE_IN_PROGRESS = "An update check is already in progress. Please wait for it to complete." as const;
const NOTICE_COMMAND_FAILED_PREFIX = "Command execution failed:" as const;

class PluginCommands {
	private commands: readonly CommandDefinition[] = [];
	private isRegistered = false;
	private isUpdateCheckRunning = false;

	public constructor(private readonly deps: Readonly<Cradle>) {
		this.commands = this.buildCommands();
	}

	public register(): void {
		if (this.isRegistered) {
			return;
		}
		this.registerCommands();
		this.isRegistered = true;
	}

	public dispose(): void {
		this.commands = [];
		this.isRegistered = false;
		this.isUpdateCheckRunning = false;
	}

	private showNotice(message: string): Notice {
		return new Notice(message);
	}

	private async executeExclusiveUpdateCheck(onlyCheckDontUpdate: boolean): Promise<Result<undefined>> {
		if (this.isUpdateCheckRunning) {
			this.showNotice(NOTICE_UPDATE_IN_PROGRESS);
			return safe.ok(undefined);
		}

		this.isUpdateCheckRunning = true;

		return safe.async(async (_$, defer): Promise<undefined> => {
			defer((): void => {
				this.isUpdateCheckRunning = false;
			});

			const result = await this.deps.pluginUpdateOrchestrator.checkForPluginUpdatesAndInstallUpdates(
				true,
				onlyCheckDontUpdate,
				false,
				true,
			);

			if (!result.ok) {
				throw result.error;
			}

			return undefined;
		});
	}

	private buildCommands(): readonly CommandDefinition[] {
		return [
			{
				id: COMMAND_CHECK_AND_UPDATE_ID,
				icon: COMMAND_CHECK_AND_UPDATE_ICON,
				name: COMMAND_CHECK_AND_UPDATE_NAME,
				showInRibbon: true,
				callback: async (): Promise<Result<undefined>> => {
					return this.executeExclusiveUpdateCheck(false);
				},
			},
			{
				id: COMMAND_CHECK_ONLY_ID,
				icon: COMMAND_CHECK_ONLY_ICON,
				name: COMMAND_CHECK_ONLY_NAME,
				showInRibbon: true,
				callback: async (): Promise<Result<undefined>> => {
					return this.executeExclusiveUpdateCheck(true);
				},
			},
			{
				id: COMMAND_INSTALL_UNTRACKED_ID,
				icon: COMMAND_INSTALL_UNTRACKED_ICON,
				name: COMMAND_INSTALL_UNTRACKED_NAME,
				showInRibbon: true,
				callback: (): Result<undefined> => {
					return this.deps.uiService.displayInstallNewPluginModal({ prefillRepo: "" });
				},
			},
			{
				id: COMMAND_TOGGLE_CE_ID,
				icon: COMMAND_TOGGLE_CE_ICON,
				name: COMMAND_TOGGLE_CE_NAME,
				showInRibbon: true,
				callback: (): Result<undefined> => {
					return safe((): undefined => {
						this.deps.ceWindowManager.toggle(this.deps.plugin);
						return undefined;
					});
				},
			},
		];
	}

	private registerCommands(): void {
		for (const item of this.commands) {
			this.deps.plugin.addCommand({
				id: item.id,
				name: item.name,
				icon: item.icon,
				callback: (): void => {
					const result = item.callback();
					if (result instanceof Promise) {
						void result.then((res): void => {
							if (!res.ok) {
								console.error(`${NOTICE_COMMAND_FAILED_PREFIX} ${item.id}`, res.error);
								this.showNotice(`${NOTICE_COMMAND_FAILED_PREFIX} ${item.id}`);
							}
						});
					} else if (!result.ok) {
						console.error(`${NOTICE_COMMAND_FAILED_PREFIX} ${item.id}`, result.error);
						this.showNotice(`${NOTICE_COMMAND_FAILED_PREFIX} ${item.id}`);
					}
				},
			});
		}
	}
}

export default PluginCommands;
