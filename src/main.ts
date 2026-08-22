import { Plugin as ObsidianPlugin } from "obsidian";
import invariant from "tiny-invariant";

import { BootState, Bootstrapper } from "@/core/Bootstrapper";
import { DEFAULT_SETTINGS_VALUES } from "@/domain/schemas";
import { safe } from "@/utils/safe";

import type { CoreModules, Cradle, Modules, Settings } from "@/domain/types";
import type { AwilixContainer } from "awilix";

const UPDATE_CHECK_DELAY = 60000;
const CHECK_LOOP_MS = 180000;

export default class CanaryEdgePlugin extends ObsidianPlugin {
	private readonly _appName = "Canary-Edge";
	private readonly _appId = "canary-edge";

	public get appName(): string {
		return this._appName;
	}
	public get appId(): string {
		return this._appId;
	}

	public override settings: Settings = DEFAULT_SETTINGS_VALUES;

	private readonly _bootstrapper = new Bootstrapper(this);
	private _mods: Modules | null = null;
	private _core: CoreModules | null = null;

	public get settingsService(): Cradle["settingsService"] {
		return this._svc("settingsService");
	}
	public get store(): Cradle["canaryStore"] {
		return this._svc("canaryStore");
	}
	public get uiService(): Cradle["uiService"] {
		return this._svc("uiService");
	}
	public get workflowService(): Cradle["pluginWorkflowService"] {
		return this._svc("pluginWorkflowService");
	}
	public get updateOrchestrator(): Cradle["pluginUpdateOrchestrator"] {
		return this._svc("pluginUpdateOrchestrator");
	}
	public get changelogService(): Cradle["pluginChangelogService"] {
		return this._svc("pluginChangelogService");
	}
	public get ceWindowManager(): Cradle["ceWindowManager"] {
		return this._svc("ceWindowManager");
	}
	public get commands(): Cradle["pluginCommands"] {
		return this._svc("pluginCommands");
	}
	public get bratIntegrationService(): Cradle["bratIntegrationService"] {
		return this._svc("bratIntegrationService");
	}
	public get indexedDbService(): Cradle["indexedDbService"] {
		return this._svc("indexedDbService");
	}

	public get container(): AwilixContainer<Cradle> {
		invariant(this._core !== null, `[${this._appName}] Dependency container accessed before core modules resolved`);
		return this._core.container;
	}

	public override onload(): void {
		this.app.workspace.onLayoutReady((): void => {
			void this._safeBoot();
		});
	}

	public override onunload(): void {
		this._teardown();
		this._bootstrapper.unload();
		this._mods = null;
		this._core = null;
	}

	public log(_text: string): void {}

	public async loadSettings(): Promise<void> {
		if (this._bootstrapper.state !== BootState.READY) {
			return;
		}
		const res = await this.settingsService.init();
		this.settings = safe.unwrap(res);
	}

	private async _safeBoot(): Promise<void> {
		if (this._bootstrapper.state === BootState.READY || this._bootstrapper.state === BootState.UNLOADED) {
			return;
		}

		const bootstrapRes = await this._bootstrapper.bootstrap();

		if (!bootstrapRes.ok) {
			this._logErr(bootstrapRes.error, "Bootstrap failed");
			return;
		}

		const { mods, core } = bootstrapRes.value;
		this._mods = mods;
		this._core = core;

		this._initServices(mods);

		const startRes = await safe.tryAsync((): Promise<void> => {
			return this._startRuntime(this._bootstrapper.generation);
		});
		if (!startRes.ok) {
			this._logErr(startRes.error, "Runtime start failed");
		}
	}

	private _initServices(m: Readonly<Modules>): void {
		invariant(this._core !== null, "Core modules missing during service init");
		const { container: c, asClass, asValue } = this._core;

		const createDisposer = (instance: { readonly dispose: () => void }): void => {
			if (typeof instance.dispose === "function") {
				instance.dispose();
			}
		};

		c.register({
			plugin: asValue(this),
			canaryStore: asClass(m.CanaryStore).singleton().disposer(createDisposer),
			settingsService: asClass(m.SettingsService).singleton().disposer(createDisposer),
			notificationService: asClass(m.NotificationService).singleton().disposer(createDisposer),
			concurrencyService: asClass(m.ConcurrencyService).singleton().disposer(createDisposer),
			operationTrackingService: asClass(m.OperationTrackingService).singleton().disposer(createDisposer),
			pluginCompatibilityService: asClass(m.PluginCompatibilityService).singleton().disposer(createDisposer),
			manifestMutationService: asClass(m.ManifestMutationService).singleton().disposer(createDisposer),
			repositoryService: asClass(m.RepositoryService).singleton().disposer(createDisposer),
			pluginQueryService: asClass(m.PluginQueryService).singleton().disposer(createDisposer),
			pluginAcquisitionService: asClass(m.PluginAcquisitionService).singleton().disposer(createDisposer),
			pluginDeploymentService: asClass(m.PluginDeploymentService).singleton().disposer(createDisposer),
			pluginInstallOperation: asClass(m.PluginInstallOperation).singleton().disposer(createDisposer),
			pluginUpdateOperation: asClass(m.PluginUpdateOperation).singleton().disposer(createDisposer),
			pluginRegisterOperation: asClass(m.PluginRegisterOperation).singleton().disposer(createDisposer),
			pluginDeleteOperation: asClass(m.PluginDeleteOperation).singleton().disposer(createDisposer),
			pluginSaveSettingsOperation: asClass(m.PluginSaveSettingsOperation).singleton().disposer(createDisposer),
			workflowNotificationPresenter: asClass(m.WorkflowNotificationPresenter).singleton().disposer(createDisposer),
			pluginWorkflowService: asClass(m.PluginWorkflowService).singleton().disposer(createDisposer),
			pluginUpdateOrchestrator: asClass(m.PluginUpdateOrchestrator).singleton().disposer(createDisposer),
			pluginChangelogService: asClass(m.PluginChangelogService).singleton().disposer(createDisposer),
			uiService: asClass(m.UIService).singleton().disposer(createDisposer),
			ceWindowManager: asClass(m.CEWindowManager).singleton().disposer(createDisposer),
			pluginCommands: asClass(m.PluginCommands).singleton().disposer(createDisposer),
			gitHubAssetService: asClass(m.GitHubAssetService).singleton().disposer(createDisposer),
			gitHubCacheService: asClass(m.GitHubCacheService).singleton().disposer(createDisposer),
			gitHubClient: asClass(m.GitHubClient).singleton().disposer(createDisposer),
			gitHubContentService: asClass(m.GitHubContentService).singleton().disposer(createDisposer),
			gitHubRateLimitService: asClass(m.GitHubRateLimitService).singleton().disposer(createDisposer),
			gitHubReleaseService: asClass(m.GitHubReleaseService).singleton().disposer(createDisposer),
			gitHubRepositoryService: asClass(m.GitHubRepositoryService).singleton().disposer(createDisposer),
			gitHubTokenService: asClass(m.GitHubTokenService).singleton().disposer(createDisposer),
			pluginLifecycle: asClass(m.PluginLifecycle).singleton().disposer(createDisposer),
			pluginInstaller: asClass(m.PluginInstaller).singleton().disposer(createDisposer),
			bratIntegrationService: asClass(m.BratIntegrationService).singleton().disposer(createDisposer),
			cancellationService: asClass(m.CancellationService).singleton().disposer(createDisposer),
			indexedDbService: asClass(m.IndexedDBService).singleton().disposer(createDisposer),
		});

		const canaryStoreInstance = c.resolve("canaryStore");
		c.resolve("settingsService");
		c.resolve("notificationService");
		c.resolve("cancellationService");
		c.resolve("indexedDbService");

		const unsubscribe = canaryStoreInstance.store.subscribe((): void => {
			const storeSettings = canaryStoreInstance.getSettings();
			if (this.settings !== storeSettings) {
				const prevEnableBratSync = this.settings.global.enableBratSync;
				const newEnableBratSync = storeSettings.global.enableBratSync;

				this.settings = storeSettings;

				if (!prevEnableBratSync && newEnableBratSync) {
					void (async (): Promise<void> => {
						const res = await this.bratIntegrationService.syncBratPlugins();
						if (!res.ok) {
							this._logErr(res.error, "BRAT synchronization failed");
						}
					})();
				}
			}
		});

		this.register((): void => {
			unsubscribe();
		});
	}

	private async _startRuntime(g: number): Promise<void> {
		if (this._bootstrapper.isStale(g)) {
			return;
		}

		const res = await this.settingsService.init();
		this.settings = safe.unwrap(res);

		if (this._bootstrapper.isStale(g)) {
			return;
		}

		this.commands.register();
		this._setupRibbon();

		if (this._bootstrapper.isStale(g)) {
			return;
		}

		const bratRes = await this.bratIntegrationService.syncBratPlugins();
		if (!bratRes.ok) {
			this._logErr(bratRes.error, "BRAT synchronization failed");
		}

		if (this._bootstrapper.isStale(g)) {
			return;
		}
		this._scheduleUpdates(g);
	}

	private _setupRibbon(): void {
		this.addRibbonIcon("puzzle", "Canary edge", (): void => {
			if (this._bootstrapper.state === BootState.READY) {
				const res = safe.try((): void => {
					this.ceWindowManager.toggle(this);
				});
				if (!res.ok) {
					this._logErr(res.error, "Ribbon action failed");
				}
			}
		});
	}

	private _scheduleUpdates(g: number): void {
		const runCheck = (initial: boolean): void => {
			if (this._bootstrapper.isStale(g)) {
				return;
			}

			void (async (): Promise<void> => {
				const bratRes = await this.bratIntegrationService.syncBratPlugins();
				if (!bratRes.ok) {
					this._logErr(bratRes.error, "BRAT synchronization failed");
				}

				const res = await this.updateOrchestrator.checkForPluginUpdatesAndInstallUpdates(false, false, initial);
				if (!res.ok) {
					this._logErr(res.error, "Update check failed");
				}
			})();
		};

		const tid = window.setTimeout((): void => {
			runCheck(true);
		}, Math.max(0, UPDATE_CHECK_DELAY));

		this.register((): void => {
			window.clearTimeout(tid);
		});

		this.registerInterval(
			window.setInterval((): void => {
				runCheck(false);
			}, Math.max(60_000, CHECK_LOOP_MS)),
		);
	}

	private _teardown(): void {
		if (this._mods === null || this._core === null) {
			return;
		}

		const c = this._core.container;

		void safe.try((): void => {
			c.resolve("ceWindowManager").close();
		});
		void safe.tryAsync(async (): Promise<void> => {
			await c.dispose();
		});
	}

	private _logErr(error: unknown, ctx: string): void {
		console.error(`[${this._appName}] ${ctx}`, error);
	}

	private _svc<K extends keyof Cradle>(serviceName: K): Cradle[K] {
		invariant(this._core !== null, `[${this._appName}] Core modules accessed before initialization`);
		return this._core.container.resolve(serviceName);
	}
}
