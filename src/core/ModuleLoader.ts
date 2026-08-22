import { safe } from "@/utils/safe";

import type { CoreModules, Cradle, Modules } from "@/domain/types";
import type { Result } from "@/utils/safe";

export class ModuleLoader {
	private readonly appName: string;

	public constructor(appName: string) {
		this.appName = appName;
	}

	public async resolveCoreModules(): Promise<Result<CoreModules>> {
		const [awilixRes, schemasRes] = await Promise.all([
			safe.tryAsync((): Promise<typeof import("awilix")> => {
				return import("awilix");
			}),
			safe.tryAsync((): Promise<typeof import("@/domain/schemas")> => {
				return import("@/domain/schemas");
			}),
		]);

		if (!awilixRes.ok) {
			return safe.err(new Error(`[${this.appName}] Failed to resolve core modules`, { cause: awilixRes.error }));
		}
		if (!schemasRes.ok) {
			return safe.err(new Error(`[${this.appName}] Failed to resolve core modules`, { cause: schemasRes.error }));
		}

		const awilixMod = awilixRes.value;
		const schemasMod = schemasRes.value;

		return safe.ok(
			Object.freeze({
				container: awilixMod.createContainer<Cradle>({
					injectionMode: awilixMod.InjectionMode.PROXY,
				}),
				DEFAULT_SETTINGS_VALUES: schemasMod.DEFAULT_SETTINGS_VALUES,
				asClass: awilixMod.asClass,
				asValue: awilixMod.asValue,
			}),
		);
	}

	public async resolveAllModules(): Promise<Result<Modules>> {
		const specs: readonly (readonly [keyof Modules, () => Promise<unknown>])[] = [
			["SettingsService", (): Promise<unknown> => { return import("@/services/SettingsService"); }],
			["NotificationService", (): Promise<unknown> => { return import("@/services/ui/NotificationService"); }],
			["ConcurrencyService", (): Promise<unknown> => { return import("@/services/ConcurrencyService"); }],
			["OperationTrackingService", (): Promise<unknown> => { return import("@/services/OperationTrackingService"); }],
			["PluginCompatibilityService", (): Promise<unknown> => { return import("@/services/PluginCompatibilityService"); }],
			["ManifestMutationService", (): Promise<unknown> => { return import("@/services/ManifestMutationService"); }],
			["RepositoryService", (): Promise<unknown> => { return import("@/services/RepositoryService"); }],
			["PluginQueryService", (): Promise<unknown> => { return import("@/services/PluginQueryService"); }],
			["PluginAcquisitionService", (): Promise<unknown> => { return import("@/services/PluginAcquisitionService"); }],
			["PluginDeploymentService", (): Promise<unknown> => { return import("@/services/PluginDeploymentService"); }],
			["PluginInstallOperation", (): Promise<unknown> => { return import("@/services/operations/PluginInstallOperation"); }],
			["PluginUpdateOperation", (): Promise<unknown> => { return import("@/services/operations/PluginUpdateOperation"); }],
			["PluginRegisterOperation", (): Promise<unknown> => { return import("@/services/operations/PluginRegisterOperation"); }],
			["PluginDeleteOperation", (): Promise<unknown> => { return import("@/services/operations/PluginDeleteOperation"); }],
			["PluginSaveSettingsOperation", (): Promise<unknown> => { return import("@/services/operations/PluginSaveSettingsOperation"); }],
			["WorkflowNotificationPresenter", (): Promise<unknown> => { return import("@/services/operations/WorkflowNotificationPresenter"); }],
			["PluginWorkflowService", (): Promise<unknown> => { return import("@/services/PluginWorkflowService"); }],
			["PluginUpdateOrchestrator", (): Promise<unknown> => { return import("@/services/PluginUpdateOrchestrator"); }],
			["PluginChangelogService", (): Promise<unknown> => { return import("@/services/PluginChangelogService"); }],
			["UIService", (): Promise<unknown> => { return import("@/services/UIService"); }],
			["CanaryStore", (): Promise<unknown> => { return import("@/store/CanaryStore"); }],
			["CEWindowManager", (): Promise<unknown> => { return import("@/ui/managers/CEWindowManager"); }],
			["PluginCommands", (): Promise<unknown> => { return import("@/ui/PluginCommands"); }],
			["GitHubAssetService", (): Promise<unknown> => { return import("@/services/github/GitHubAssetService"); }],
			["GitHubCacheService", (): Promise<unknown> => { return import("@/services/github/GitHubCacheService"); }],
			["GitHubClient", (): Promise<unknown> => { return import("@/services/github/GitHubClient"); }],
			["GitHubContentService", (): Promise<unknown> => { return import("@/services/github/GitHubContentService"); }],
			["GitHubRateLimitService", (): Promise<unknown> => { return import("@/services/github/GitHubRateLimitService"); }],
			["GitHubReleaseService", (): Promise<unknown> => { return import("@/services/github/GitHubReleaseService"); }],
			["GitHubRepositoryService", (): Promise<unknown> => { return import("@/services/github/GitHubRepositoryService"); }],
			["GitHubTokenService", (): Promise<unknown> => { return import("@/services/github/GitHubTokenService"); }],
			["PluginLifecycle", (): Promise<unknown> => { return import("@/services/PluginLifecycle"); }],
			["PluginInstaller", (): Promise<unknown> => { return import("@/services/PluginInstaller"); }],
			["BratIntegrationService", (): Promise<unknown> => { return import("@/services/BratIntegrationService"); }],
			["CancellationService", (): Promise<unknown> => { return import("@/services/CancellationService"); }],
			["IndexedDBService", (): Promise<unknown> => { return import("@/services/infrastructure/IndexedDBService"); }],
		] as const;

		const results: [keyof Modules, unknown][] = [];
		for (const [moduleKey, loader] of specs) {
			const modRes = await safe.tryAsync((): Promise<Record<string, unknown>> => {
				return loader() as Promise<Record<string, unknown>>;
			});
			if (!modRes.ok) {
				return safe.err(new Error(`[${this.appName}] Failed to import module: ${moduleKey}`, { cause: modRes.error }));
			}
			const mod = modRes.value;

			const exportName = moduleKey === "PluginCommands" ? "default" : moduleKey;
			const val = mod[exportName];

			if (val === undefined || val === null) {
				return safe.err(new Error(`Module missing export: ${exportName}`));
			}
			results.push([moduleKey, val]);
		}

		return safe.ok(Object.freeze(Object.fromEntries(results) as unknown as Modules));
	}
}
