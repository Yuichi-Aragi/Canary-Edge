import { omit } from "es-toolkit";
import { create } from "mutative";
import PQueue from "p-queue";
import { match, P } from "ts-pattern";
import { safeParse } from "valibot";

import { DEFAULT_SETTINGS_VALUES, SettingsSchema } from "@/domain/schemas";
import { safe } from "@/utils/safe";
import { resolveToken } from "@/utils/secretUtils";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Draft } from "mutative";
import type {
	Cradle,
	PluginConfig,
	PluginConfigurationOverrides,
	ResolvedPluginConfiguration,
	Settings,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

interface WriteRequest {
	readonly recipe: (draft: Draft<Settings>) => void;
	readonly expectedVersion: number;
	readonly resolve: (res: Result<undefined>) => void;
}

export interface AddPluginToListOptions {
	readonly isFrozen: boolean;
	readonly privateApiKeySecretId?: string | undefined;
	readonly isIncompatible?: boolean | undefined;
	readonly overrides?: Readonly<PluginConfigurationOverrides> | undefined;
	readonly mergeWithExisting?: boolean | undefined;
}

export class SettingsService {
	private readonly requestQueue: PQueue = new PQueue({ concurrency: 1 });
	private readonly safeCtx = safe.bind(this);
	private pendingWrite: WriteRequest | null = null;
	private isSavingToDisk = false;
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public isSaving(): boolean {
		return this.isSavingToDisk;
	}

	public getSettings(): Result<Settings> {
		return this.safeCtx((): Settings => {
			return this.deps.canaryStore.getSettings();
		});
	}

	public async getSettingsQueued(): Promise<Result<Settings>> {
		return this.safeCtx.async<Settings>(async ($) => {
			const queuedRes = await this.requestQueue.add((): Result<Settings> => {
				return this.getSettings();
			});
			return $(queuedRes);
		});
	}

	public async init(): Promise<Result<Settings>> {
		return this.safeCtx.async<Settings>(async () => {
			const loadRes = await safe.tryAsync(async (): Promise<unknown> => {
				return this.deps.plugin.loadData();
			});
			const loadedData = safe.unwrapOr(loadRes, null);

			const parsedSettings = match(loadedData)
				.with(P.nullish, (): Settings => {
					return structuredClone(DEFAULT_SETTINGS_VALUES);
				})
				.otherwise((data): Settings => {
					const validation = safeParse(SettingsSchema, data);
					if (validation.success) {
						return {
							...DEFAULT_SETTINGS_VALUES,
							...validation.output,
							global: {
								...DEFAULT_SETTINGS_VALUES.global,
								...validation.output.global,
							},
							plugins: {
								...DEFAULT_SETTINGS_VALUES.plugins,
								...validation.output.plugins,
							},
							version: validation.output.version,
						};
					}
					console.error("Settings validation failed, falling back to defaults", validation.issues);
					return structuredClone(DEFAULT_SETTINGS_VALUES);
				});

			const consistentSettings = create(parsedSettings, (draft: Draft<Settings>): void => {
				this.enforceAllPluginsConsistency(draft);
			});

			this.deps.plugin.settings = consistentSettings;
			this.deps.canaryStore.setSettings(consistentSettings);

			await this.deps.plugin.saveData(consistentSettings);

			return consistentSettings;
		});
	}

	public async updateSettings(
		recipe: (draft: Draft<Settings>) => void,
		expectedVersion: number,
	): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			if (this.pendingWrite !== null) {
				this.pendingWrite.resolve(safe.err(new Error("Settings write superseded by a subsequent write request")));
				this.pendingWrite = null;
			}

			const res = await new Promise<Result<undefined>>((resolve): void => {
				const req: WriteRequest = { recipe, expectedVersion, resolve };
				this.pendingWrite = req;

				void this.requestQueue.add(async (): Promise<void> => {
					if (this.pendingWrite !== req || this.disposed) {
						return;
					}
					this.pendingWrite = null;
					await this.executeWrite(req);
				});
			});

			$(res);
			return undefined;
		});
	}

	public async updatePluginSettings(
		repo: string,
		recipe: (pluginDraft: Draft<PluginConfig>) => void,
		expectedVersion: number,
	): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			const sanitizedRepo = this.sanitizeRepo(repo);

			$(
				await this.updateSettings((draft: Draft<Settings>): void => {
					draft.plugins[sanitizedRepo] ??= {};
					const pluginDraft = draft.plugins[sanitizedRepo];
					recipe(pluginDraft);
				}, expectedVersion),
			);

			return undefined;
		});
	}

	private async executeWrite(req: Readonly<WriteRequest>): Promise<void> {
		const writeRes = await this.safeCtx.async<undefined>(async ($) => {
			const currentSettings = $(this.getSettings());

			if (req.expectedVersion !== currentSettings.version) {
				throw new Error(
					`Settings update rejected: version mismatch. Expected version ${String(req.expectedVersion)}, but current settings version is ${String(currentSettings.version)}.`,
				);
			}

			const newSettings = create(currentSettings, (draft: Draft<Settings>): void => {
				req.recipe(draft);
				draft.version = draft.version + 1;
				this.enforceAllPluginsConsistency(draft);
			});

			this.deps.plugin.settings = newSettings;
			this.deps.canaryStore.setSettings(newSettings);

			this.isSavingToDisk = true;
			const saveRes = await safe.tryAsync(async (): Promise<void> => {
				await this.deps.plugin.saveData(newSettings);
			});
			this.isSavingToDisk = false;

			if (!saveRes.ok) {
				console.error("Failed to save settings. Rolling back in-memory state.", saveRes.error);
				this.deps.plugin.settings = currentSettings;
				this.deps.canaryStore.setSettings(currentSettings);
				throw saveRes.error;
			}

			return undefined;
		});

		req.resolve(writeRes);
	}

	private enforceAllPluginsConsistency(draft: Draft<Settings>): void {
		const { plugins } = draft;
		for (const key of Object.keys(plugins)) {
			const pluginItem = plugins[key];
			if (pluginItem !== undefined) {
				this.enforcePluginConsistency(pluginItem, draft.global);
			}
		}
	}

	private enforceSubConsistency<T extends Record<string, unknown>>(
		pluginSub: Draft<T> | undefined,
		globalSub: Readonly<T>,
		clearSub: () => void,
	): void {
		if (pluginSub === undefined) {
			return;
		}
		let hasCustom = false;
		const draftRecord = pluginSub as Record<string, unknown>;
		const globalRecord = globalSub as Readonly<Record<string, unknown>>;
		for (const key of Object.keys(globalRecord)) {
			if (draftRecord[key] === globalRecord[key]) {
				draftRecord[key] = undefined;
			} else if (draftRecord[key] !== undefined) {
				hasCustom = true;
			}
		}
		if (!hasCustom) {
			clearSub();
		}
	}

	private enforcePluginConsistency(plugin: Draft<PluginConfig>, globalConfig: Readonly<Settings["global"]>): void {
		if (plugin.autoEnable === globalConfig.autoEnable) {
			plugin.autoEnable = undefined;
		}
		if (plugin.tokenSecretId === globalConfig.tokenSecretId) {
			plugin.tokenSecretId = undefined;
		}
		if (plugin.releaseChannel === globalConfig.releaseChannel) {
			plugin.releaseChannel = undefined;
		}

		this.enforceSubConsistency(plugin.showChangelog, globalConfig.showChangelog, (): void => {
			plugin.showChangelog = undefined;
		});

		this.enforceSubConsistency(plugin.updateInterval, globalConfig.updateInterval, (): void => {
			plugin.updateInterval = undefined;
		});

		this.enforceSubConsistency(plugin.updateCheckOnLoad, globalConfig.updateCheckOnLoad, (): void => {
			plugin.updateCheckOnLoad = undefined;
		});

		this.enforceSubConsistency(plugin.forceInstall, globalConfig.forceInstall, (): void => {
			plugin.forceInstall = undefined;
		});
	}

	public getPluginConfiguration(repositoryPath: string): Result<ResolvedPluginConfiguration> {
		return this.safeCtx(($): ResolvedPluginConfiguration => {
			const sanitizedRepo = this.sanitizeRepo(repositoryPath);
			const settings = $(this.getSettings());
			const globalConfig = settings.global;
			const localConfig = settings.plugins[sanitizedRepo];

			return {
				autoEnable: localConfig?.autoEnable ?? globalConfig.autoEnable,
				showChangelog: {
					mode: localConfig?.showChangelog?.mode ?? globalConfig.showChangelog.mode,
					priority: localConfig?.showChangelog?.priority ?? globalConfig.showChangelog.priority,
				},
				tokenSecretId: localConfig?.tokenSecretId ?? globalConfig.tokenSecretId,
				updateInterval: {
					value: localConfig?.updateInterval?.value ?? globalConfig.updateInterval.value,
					autoDownload: localConfig?.updateInterval?.autoDownload ?? globalConfig.updateInterval.autoDownload,
				},
				releaseChannel: localConfig?.releaseChannel ?? globalConfig.releaseChannel,
				updateCheckOnLoad: {
					enabled: localConfig?.updateCheckOnLoad?.enabled ?? globalConfig.updateCheckOnLoad.enabled,
					autoDownload: localConfig?.updateCheckOnLoad?.autoDownload ?? globalConfig.updateCheckOnLoad.autoDownload,
				},
				forceInstall: {
					version: localConfig?.forceInstall?.version ?? globalConfig.forceInstall.version,
					platform: localConfig?.forceInstall?.platform ?? globalConfig.forceInstall.platform,
				},
			};
		});
	}

	public async updateLastUpdateCheck(repositoryPath: string, expectedVersion: number): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			$(
				await this.updatePluginSettings(
					repositoryPath,
					(plugin: Draft<PluginConfig>): void => {
						plugin.lastChecked = Date.now();
					},
					expectedVersion,
				),
			);
			return undefined;
		});
	}

	private applySubOverrides<T extends Record<string, unknown>>(
		pluginSub: Draft<T> | undefined,
		overridesSub: Readonly<T> | undefined,
		initSub: () => Draft<T>,
	): void {
		if (overridesSub === undefined) {
			return;
		}
		const target = pluginSub ?? initSub();
		const targetRecord = target as Record<string, unknown>;
		const overridesRecord = overridesSub as Readonly<Record<string, unknown>>;
		for (const key of Object.keys(overridesRecord)) {
			const val = overridesRecord[key];
			if (val !== undefined) {
				targetRecord[key] = val;
			}
		}
	}

	private applyOverrides(plugin: Draft<PluginConfig>, overrides?: Readonly<PluginConfigurationOverrides>): void {
		if (overrides === undefined) {
			return;
		}
		if (overrides.autoEnable !== undefined) {
			plugin.autoEnable = overrides.autoEnable;
		}
		if (overrides.tokenSecretId !== undefined) {
			plugin.tokenSecretId = overrides.tokenSecretId === false ? undefined : overrides.tokenSecretId;
		}
		if (overrides.releaseChannel !== undefined) {
			plugin.releaseChannel = overrides.releaseChannel;
		}

		this.applySubOverrides(
			plugin.showChangelog,
			overrides.showChangelog,
			(): Draft<NonNullable<PluginConfig["showChangelog"]>> => {
				plugin.showChangelog = {};
				return plugin.showChangelog;
			},
		);

		this.applySubOverrides(
			plugin.updateInterval,
			overrides.updateInterval,
			(): Draft<NonNullable<PluginConfig["updateInterval"]>> => {
				plugin.updateInterval = {};
				return plugin.updateInterval;
			},
		);

		this.applySubOverrides(
			plugin.updateCheckOnLoad,
			overrides.updateCheckOnLoad,
			(): Draft<NonNullable<PluginConfig["updateCheckOnLoad"]>> => {
				plugin.updateCheckOnLoad = {};
				return plugin.updateCheckOnLoad;
			},
		);

		this.applySubOverrides(
			plugin.forceInstall,
			overrides.forceInstall,
			(): Draft<NonNullable<PluginConfig["forceInstall"]>> => {
				plugin.forceInstall = {};
				return plugin.forceInstall;
			},
		);
	}

	public async addPluginToList(
		repositoryPath: string,
		options: Readonly<AddPluginToListOptions>,
		expectedVersion = 0,
	): Promise<Result<undefined>> {
		return this.upsertPlugin(
			repositoryPath,
			{
				isFrozen: options.isFrozen,
				privateApiKeySecretId: options.privateApiKeySecretId,
				isIncompatible: options.isIncompatible,
				overrides: options.overrides,
				mergeWithExisting: options.mergeWithExisting,
			},
			expectedVersion,
		);
	}

	public async upsertPlugin(
		repositoryPath: string,
		options: Readonly<{
			readonly isFrozen?: boolean | undefined;
			readonly privateApiKeySecretId?: string | undefined;
			readonly isIncompatible?: boolean | undefined;
			readonly overrides?: Readonly<PluginConfigurationOverrides> | undefined;
			readonly preserveFrozenStatus?: boolean | undefined;
			readonly mergeWithExisting?: boolean | undefined;
		}>,
		expectedVersion: number,
	): Promise<Result<undefined>> {
		return this.updatePluginSettings(
			repositoryPath,
			(plugin: Draft<PluginConfig>): void => {
				const existingIsFrozen = plugin.status === "frozen";

				if (options.isFrozen !== undefined) {
					if (options.preserveFrozenStatus !== true || !existingIsFrozen) {
						plugin.status = options.isFrozen ? "frozen" : "active";
					}
				}

				const merge = options.mergeWithExisting ?? true;
				const trimmedToken = options.privateApiKeySecretId?.trim() ?? "";

				if (merge) {
					if (trimmedToken !== "") {
						plugin.tokenSecretId = trimmedToken;
					}
					if (options.isIncompatible !== undefined) {
						plugin.compatibility = options.isIncompatible ? "incompatible" : undefined;
					}
				} else {
					plugin.tokenSecretId = trimmedToken !== "" ? trimmedToken : undefined;
					plugin.compatibility = options.isIncompatible === true ? "incompatible" : undefined;
				}

				this.applyOverrides(plugin, options.overrides);
			},
			expectedVersion,
		);
	}

	public resolveTokenSecretId(repositoryPath: string, privateApiKeySecretId?: string): Result<string> {
		return this.safeCtx(($): string => {
			const sanitizedRepo = this.sanitizeRepo(repositoryPath, false);
			if (sanitizedRepo === "") {
				return "";
			}
			const settings = $(this.getSettings());
			const existingConfig = settings.plugins[sanitizedRepo];

			return privateApiKeySecretId !== undefined && privateApiKeySecretId !== ""
				? privateApiKeySecretId
				: existingConfig?.tokenSecretId ?? "";
		});
	}

	public getEffectiveTokenForRepo(repositoryPath: string, privateApiKeySecretId?: string): Result<string> {
		return this.safeCtx(($): string => {
			const secretId = $(this.resolveTokenSecretId(repositoryPath, privateApiKeySecretId));
			return $(this.getEffectiveToken(secretId));
		});
	}

	public async removePluginFromList(repositoryPath: string, expectedVersion: number): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			const sanitizedRepo = this.sanitizeRepo(repositoryPath);
			$(
				await this.updateSettings((draft: Draft<Settings>): void => {
					draft.plugins = omit(draft.plugins, [sanitizedRepo]);
				}, expectedVersion),
			);
			return undefined;
		});
	}

	public existPluginInList(repositoryPath: string): Result<boolean> {
		return this.safeCtx(($): boolean => {
			const sanitizedRepo = this.sanitizeRepo(repositoryPath, false);
			if (sanitizedRepo === "") {
				return false;
			}
			const settings = $(this.getSettings());
			return Object.hasOwn(settings.plugins, sanitizedRepo);
		});
	}

	public getEffectiveToken(repoSecretId?: string): Result<string> {
		return this.safeCtx(($): string => {
			const settings = $(this.getSettings());

			const globalTokenId = settings.global.tokenSecretId === false ? "" : settings.global.tokenSecretId;
			const globalToken = resolveToken(this.deps.plugin.app, globalTokenId);
			const repoToken = resolveToken(this.deps.plugin.app, repoSecretId ?? "");

			return repoToken !== "" ? repoToken : globalToken;
		});
	}

	public getToken(secretId: string): Result<string> {
		return this.safeCtx((): string => {
			return resolveToken(this.deps.plugin.app, secretId);
		});
	}

	private sanitizeRepo(repositoryPath: string, throwOnInvalid = true): string {
		const sanitized = scrubRepositoryUrl(repositoryPath);
		if (sanitized === "" && throwOnInvalid) {
			throw new Error(`Invalid repository URL: ${repositoryPath}`);
		}
		return sanitized;
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.requestQueue.pause();
		this.requestQueue.clear();

		if (this.pendingWrite !== null) {
			this.pendingWrite.resolve(safe.err(new Error("SettingsService has been disposed")));
			this.pendingWrite = null;
		}
	}
}
