import { array, fallback, nullable, object, optional, safeParse, string } from "valibot";

import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Draft } from "mutative";
import type { InferOutput } from "valibot";
import type { InternalApp } from "@/domain/obsidian-internals";
import type { Cradle, Settings } from "@/domain/types";
import type { Result } from "@/utils/safe";

const OBSIDIAN_BRAT_PLUGIN_ID = "obsidian42-brat" as const;
const LATEST_VERSION_TAG = "latest" as const;
const PLUGIN_STATUS_FROZEN = "frozen" as const;
const PLUGIN_STATUS_ACTIVE = "active" as const;

export const BratPluginSubListSchema = object({
	repo: string(),
	version: fallback(string(), LATEST_VERSION_TAG),
	tokenName: optional(nullable(string())),
});

export const BratDataSchema = object({
	pluginList: fallback(array(string()), []),
	pluginSubListFrozenVersion: fallback(array(BratPluginSubListSchema), []),
	globalTokenName: optional(nullable(string())),
});

export type BratData = InferOutput<typeof BratDataSchema>;

export interface BratPluginMeta {
	readonly tokenName: string | undefined;
	readonly isFrozen: boolean;
}

function trimToUndefined(val: unknown): string | undefined {
	if (typeof val !== "string") {
		return undefined;
	}
	const trimmed = val.trim();
	return trimmed === "" ? undefined : trimmed;
}

function normalizeRepoUrl(rawRepo: string): string | undefined {
	const scrubbed = scrubRepositoryUrl(rawRepo);
	return scrubbed === "" ? undefined : scrubbed;
}

function isVersionFrozen(version: unknown): boolean {
	const trimmed = trimToUndefined(version);
	if (trimmed === undefined) {
		return false;
	}
	return trimmed.toLowerCase() !== LATEST_VERSION_TAG;
}

function resolveTokenSecret(
	metaTokenName: string | undefined,
	globalTokenName: string,
): string | undefined {
	const trimmedMeta = trimToUndefined(metaTokenName);
	if (trimmedMeta !== undefined) {
		return trimmedMeta;
	}

	return trimToUndefined(globalTokenName);
}

export class BratIntegrationService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async syncBratPlugins(): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			$.checkpoint();
			const settings = $(await this.deps.settingsService.getSettingsQueued());
			if (!settings.global.enableBratSync) {
				return undefined;
			}

			const app = this.deps.plugin.app as InternalApp;

			if (!this.isBratInstalled(app)) {
				return undefined;
			}

			const path = this.getBratDataPath(app);
			const rawContent = $(await this.readBratSettings(app, path));

			if (rawContent.trim() === "") {
				return undefined;
			}

			const bratData = $(this.parseAndValidateBratData(rawContent));
			const globalTokenName = bratData.globalTokenName ?? "";

			const pluginMap = this.extractPluginMetadata(bratData);
			$(await this.syncPluginList(pluginMap, globalTokenName));

			return undefined;
		});
	}

	private isBratInstalled(app: Readonly<InternalApp>): boolean {
		return Object.hasOwn(app.plugins.manifests, OBSIDIAN_BRAT_PLUGIN_ID);
	}

	private getBratDataPath(app: Readonly<InternalApp>): string {
		const { configDir } = app.vault;
		return `${configDir}/plugins/${OBSIDIAN_BRAT_PLUGIN_ID}/data.json`;
	}

	private async readBratSettings(app: Readonly<InternalApp>, path: string): Promise<Result<string>> {
		return this.safeCtx.async<string>(async ($) => {
			$.checkpoint();
			const exists = await app.vault.adapter.exists(path);
			if (!exists) {
				return "";
			}
			return app.vault.adapter.read(path);
		});
	}

	private parseAndValidateBratData(rawContent: string): Result<BratData> {
		return this.safeCtx(($) => {
			$.checkpoint();
			const parseRes = safe.try((): unknown => {
				return JSON.parse(rawContent);
			});

			if (!parseRes.ok) {
				throw new Error("BRAT data configuration layout was invalid JSON.");
			}

			const parsed: unknown = parseRes.value;
			const validationResult = safeParse(BratDataSchema, parsed);

			if (!validationResult.success) {
				throw new Error("BRAT data configuration layout was invalid or unrecognizable.");
			}

			return validationResult.output;
		});
	}

	private extractPluginMetadata(bratData: Readonly<BratData>): ReadonlyMap<string, BratPluginMeta> {
		const pluginMap = new Map<string, BratPluginMeta>();

		const registerPlugin = (rawRepo: string, isFrozen: boolean, tokenName?: string): void => {
			const scrubbed = normalizeRepoUrl(rawRepo);
			if (scrubbed === undefined) {
				return;
			}
			const existing = pluginMap.get(scrubbed);
			pluginMap.set(scrubbed, {
				isFrozen: isFrozen || (existing?.isFrozen ?? false),
				tokenName: tokenName ?? existing?.tokenName,
			});
		};

		for (const rawRepo of bratData.pluginList) {
			registerPlugin(rawRepo, false);
		}

		for (const entry of bratData.pluginSubListFrozenVersion) {
			registerPlugin(entry.repo, isVersionFrozen(entry.version), trimToUndefined(entry.tokenName));
		}

		return pluginMap;
	}

	private async syncPluginList(
		pluginMap: ReadonlyMap<string, BratPluginMeta>,
		globalTokenName: string,
	): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			$.checkpoint();
			const entries = Array.from(pluginMap.entries());
			if (entries.length === 0) {
				return undefined;
			}

			const settings = $(await this.deps.settingsService.getSettingsQueued());
			const expectedVersion = settings.version;

			const newlyAdded: string[] = [];
			for (const [repo] of entries) {
				const exists = Object.hasOwn(settings.plugins, repo);
				if (!exists) {
					newlyAdded.push(repo);
				}
			}

			if (newlyAdded.length === 0) {
				return undefined;
			}

			const updateResult = await this.deps.settingsService.updateSettings((draft: Draft<Settings>): void => {
				for (const repo of newlyAdded) {
					const meta = pluginMap.get(repo);
					if (meta === undefined) {
						continue;
					}
					const tokenSecretId = resolveTokenSecret(meta.tokenName, globalTokenName);

					draft.plugins[repo] = {
						status: meta.isFrozen ? PLUGIN_STATUS_FROZEN : PLUGIN_STATUS_ACTIVE,
						tokenSecretId,
					};
				}
			}, expectedVersion);

			$(updateResult);
			return undefined;
		});
	}
}