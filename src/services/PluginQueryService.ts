import { differenceBy, intersectionBy } from "es-toolkit";
import { match } from "ts-pattern";
import { safeParse } from "valibot";

import { PluginManifestSchema } from "@/domain/schemas";
import { resolveApiContext } from "@/utils/contextUtils";
import { parseDurationToMinutes } from "@/utils/dateUtils";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { PluginManifest } from "obsidian";
import type { InternalApp, InternalPlugins } from "@/domain/obsidian-internals";
import type {
	Cradle,
	OperationContext,
	PluginConfig,
	PluginListItem,
	ResolvedPluginConfiguration,
} from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

export interface BidirectionalMapping {
	readonly idToRepo: Map<string, string>;
	readonly repoToId: Map<string, string>;
}

export class PluginQueryService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	private getInternalPlugins(): Result<InternalPlugins> {
		return this.safeCtx((): InternalPlugins => {
			return (this.deps.plugin.app as InternalApp).plugins;
		});
	}

	public async getPluginIdByRepoOrName(repoOrName: string): Promise<Result<string | undefined>> {
		return this.safeCtx.async<string | undefined>(async () => {
			const normalized = repoOrName.trim().toLowerCase();
			if (normalized === "") {
				return undefined;
			}

			const scrubbed = scrubRepositoryUrl(normalized).toLowerCase();
			const target = scrubbed !== "" ? scrubbed : normalized;

			const cachedPlugin = safe.unwrapOr(await this.deps.indexedDbService.getPluginByIdOrRepo(target), null);
			if (cachedPlugin !== null && cachedPlugin !== undefined && cachedPlugin.id !== "") {
				return cachedPlugin.id;
			}

			return target.includes("/") ? (target.split("/")[1] ?? target) : target;
		});
	}

	public async getPluginIdByRepo(repo: string): Promise<Result<string | undefined>> {
		return this.getPluginIdByRepoOrName(repo);
	}

	public async getRepoByPluginId(pluginId: string): Promise<Result<string | undefined>> {
		return this.safeCtx.async<string | undefined>(async () => {
			const normalizedId = pluginId.trim().toLowerCase();
			if (normalizedId === "") {
				return undefined;
			}

			const cachedPlugin = safe.unwrapOr(await this.deps.indexedDbService.getPluginByIdOrRepo(normalizedId), null);
			if (cachedPlugin !== null && cachedPlugin !== undefined && cachedPlugin.repo !== "") {
				return cachedPlugin.repo;
			}

			const settings = safe.unwrapOr(this.deps.settingsService.getSettings(), null);
			if (settings !== null) {
				for (const trackedRepo of Object.keys(settings.plugins)) {
					const repoLower = trackedRepo.toLowerCase().trim();
					const scrubbedRepo = scrubRepositoryUrl(repoLower).toLowerCase().trim();
					const repoName =
						scrubbedRepo.includes("/") ? (scrubbedRepo.split("/")[1] ?? scrubbedRepo) : scrubbedRepo;

					if (repoLower === normalizedId || scrubbedRepo === normalizedId || repoName === normalizedId) {
						return trackedRepo;
					}
				}
			}

			return undefined;
		});
	}

	public async getBidirectionalMappings(trackedRepos: readonly string[]): Promise<Result<BidirectionalMapping>> {
		return this.safeCtx.async<BidirectionalMapping>(async () => {
			const idToRepo = new Map<string, string>();
			const repoToId = new Map<string, string>();

			for (const repo of trackedRepos) {
				const trimmedRepo = repo.trim();
				if (trimmedRepo === "") {
					continue;
				}

				const idResult = await this.getPluginIdByRepoOrName(trimmedRepo);
				const resolvedId = safe.unwrapOr(idResult, undefined);

				if (resolvedId !== undefined && resolvedId !== "") {
					const normalizedId = resolvedId.toLowerCase().trim();
					idToRepo.set(normalizedId, trimmedRepo);
					repoToId.set(trimmedRepo.toLowerCase().trim(), normalizedId);
				}
			}

			return { idToRepo, repoToId };
		});
	}

	public getEnabledDisabledPlugins(enabled: boolean): Result<PluginManifest[]> {
		return this.safeCtx(($) => {
			const plugins = $(this.getInternalPlugins());
			const { manifests: manifestsMap, plugins: enabledMap } = plugins;

			const manifests: PluginManifest[] = Object.values(manifestsMap);
			const enabledPlugins: PluginManifest[] = Object.values(enabledMap).map((p): PluginManifest => {
				return p.manifest;
			});

			return match(enabled)
				.with(true, (): PluginManifest[] => {
					return intersectionBy(manifests, enabledPlugins, (x: Readonly<PluginManifest>): string => {
						return x.id;
					});
				})
				.with(false, (): PluginManifest[] => {
					return differenceBy(manifests, enabledPlugins, (x: Readonly<PluginManifest>): string => {
						return x.id;
					});
				})
				.exhaustive();
		});
	}

	public getAllInstalledPlugins(): Result<PluginManifest[]> {
		return this.safeCtx(($) => {
			const plugins = $(this.getInternalPlugins());
			return Object.values(plugins.manifests);
		});
	}

	public getUpdatablePlugins(): Result<PluginListItem[]> {
		return this.safeCtx(($) => {
			const settings = $(this.deps.settingsService.getSettings());
			const { plugins } = settings;
			const result: PluginListItem[] = [];

			for (const repo in plugins) {
				if (Object.hasOwn(plugins, repo)) {
					const config = plugins[repo];
					if (config !== undefined && config.status !== "frozen") {
						result.push({
							repo,
							version: "latest",
							isFrozen: false,
							tokenSecretId: config.tokenSecretId,
						});
					}
				}
			}

			return result;
		});
	}

	public isEligibleForAutoUpdate(
		repo: string,
		precomputedConfig?: Readonly<ResolvedPluginConfiguration>,
	): Result<boolean> {
		return this.safeCtx(($) => {
			const config = precomputedConfig ?? $(this.deps.settingsService.getPluginConfiguration(repo));

			if (config.updateInterval.value === false) {
				return false;
			}

			const lastCheck = $(this.getFrozenMetadata(repo))?.lastChecked;

			if (lastCheck === undefined) {
				return true;
			}

			const now = Date.now();
			const intervalMinutes = parseDurationToMinutes(config.updateInterval.value);
			const intervalMs = Math.max(60_000, intervalMinutes * 60 * 1000);

			return now >= lastCheck + intervalMs;
		});
	}

	public getReinstallablePlugins(): Result<string[]> {
		return this.safeCtx(($) => {
			const settings = $(this.deps.settingsService.getSettings());
			return Object.keys(settings.plugins);
		});
	}

	public getIncompatiblePlugins(): Result<string[]> {
		return this.safeCtx(($) => {
			const settings = $(this.deps.settingsService.getSettings());
			const { plugins } = settings;
			const result: string[] = [];

			for (const repo in plugins) {
				if (Object.hasOwn(plugins, repo)) {
					const config = plugins[repo];
					if (config?.compatibility === "incompatible") {
						result.push(repo);
					}
				}
			}

			return result;
		});
	}

	public getFrozenMetadata(repo: string): Result<PluginConfig | undefined> {
		return this.safeCtx(($) => {
			const settings = $(this.deps.settingsService.getSettings());
			return settings.plugins[repo];
		});
	}

	public async getLocalManifest(
		pluginId: string,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<PluginManifest | null>> {
		const boundCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return boundCtx.async<PluginManifest | null>(async ($) => {
			$.checkpoint();
			const contentRes = await this.deps.pluginInstaller.readLocalManifest(pluginId, boundCtx);
			if (!contentRes.ok) {
				const sysErr = contentRes.error as unknown as { readonly errno?: number; readonly code?: string };
				if (sysErr.errno === -4058 || sysErr.errno === -2 || sysErr.code === "ENOENT") {
					return null;
				}
				throw contentRes.error;
			}

			const content = contentRes.value;
			if (content === "") {
				return null;
			}

			const parseRes = safe.try((): unknown => {
				return JSON.parse(content);
			});
			if (!parseRes.ok) {
				console.error(`[Canary-Edge] Failed to parse local manifest JSON for plugin ${pluginId}:`, parseRes.error);
				return null;
			}

			const parsedJson: unknown = parseRes.value;
			const validation = safeParse(PluginManifestSchema, parsedJson);
			if (!validation.success) {
				console.error(`[Canary-Edge] Invalid local manifest schema for plugin ${pluginId}:`, validation.issues);
				return null;
			}

			return validation.output as PluginManifest;
		});
	}
}