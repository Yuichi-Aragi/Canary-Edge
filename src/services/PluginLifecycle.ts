import { normalizePath } from "obsidian";
import invariant from "tiny-invariant";

import { isCanaryEdge } from "@/domain/schemas";
import { resolveApiContext } from "@/utils/contextUtils";
import { safe } from "@/utils/safe";

import type { InternalApp, InternalPlugins } from "@/domain/obsidian-internals";
import type { Cradle, OperationContext } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

export class PluginLifecycle {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public getInternalPlugins(): Result<InternalPlugins> {
		return this.safeCtx((): InternalPlugins => {
			return (this.deps.plugin.app as InternalApp).plugins;
		});
	}

	private async deferIfCanaryEdge(pluginId: string, signal?: AbortSignal): Promise<Result<undefined>> {
		const ownManifestId = this.deps.plugin.manifest.id;
		if (isCanaryEdge(pluginId, ownManifestId)) {
			return this.deps.concurrencyService.waitForOtherRepoOperations(pluginId, signal);
		}
		return safe.ok(undefined);
	}

	private async executeLifecycleAction(
		pluginId: string,
		actionName: string,
		actionFn: (plugins: InternalPlugins) => Promise<void>,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<undefined>> {
		const boundCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return boundCtx.async<undefined>(async ($) => {
			$.checkpoint();
			invariant(pluginId !== "", `Plugin ID is required for ${actionName}`);

			$(await this.deferIfCanaryEdge(pluginId, boundCtx.options.signal));

			$(
				await this.deps.concurrencyService.schedulePlugin(
					pluginId,
					actionName,
					async (): Promise<Result<undefined>> => {
						return safe.tryAsync(async (): Promise<undefined> => {
							const plugins = $(this.getInternalPlugins());
							$.checkpoint();
							await actionFn(plugins);
							return undefined;
						});
					},
					{ signal: boundCtx.options.signal },
				),
			);
			return undefined;
		});
	}

	public async reloadPlugin(pluginId: string, ctx?: OperationContext | Api | AbortSignal): Promise<Result<undefined>> {
		return this.executeLifecycleAction(
			pluginId,
			"reload",
			async (plugins: InternalPlugins): Promise<void> => {
				await plugins.disablePlugin(pluginId);
				await plugins.enablePlugin(pluginId);
			},
			ctx,
		);
	}

	public async enablePluginAndSave(
		pluginId: string,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<undefined>> {
		return this.executeLifecycleAction(
			pluginId,
			"enable",
			async (plugins: InternalPlugins): Promise<void> => {
				const pluginTargetFolderPath = normalizePath(`${plugins.getPluginFolder()}/${pluginId}`);
				await plugins.loadManifest(pluginTargetFolderPath);
				await plugins.enablePluginAndSave(pluginId);
			},
			ctx,
		);
	}

	public async disablePluginAndSave(
		pluginId: string,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<undefined>> {
		return this.executeLifecycleAction(
			pluginId,
			"disable",
			async (plugins: InternalPlugins): Promise<void> => {
				await plugins.disablePluginAndSave(pluginId);
			},
			ctx,
		);
	}

	public async loadManifests(ctx?: OperationContext | Api | AbortSignal): Promise<Result<undefined>> {
		const boundCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return boundCtx.async<undefined>(async ($) => {
			$.checkpoint();
			$(
				await this.deps.concurrencyService.schedulePlugin(
					"*",
					"loadManifests",
					async (): Promise<Result<undefined>> => {
						return safe.tryAsync(async (): Promise<undefined> => {
							const plugins = $(this.getInternalPlugins());
							$.checkpoint();
							await plugins.loadManifests();
							return undefined;
						});
					},
					{ signal: boundCtx.options.signal },
				),
			);
			return undefined;
		});
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}
}
