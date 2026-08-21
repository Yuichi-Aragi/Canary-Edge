import { ModuleLoader } from "@/core/ModuleLoader";
import { safe, type Result } from "@/utils/safe";
import type { Modules, CoreModules } from "@/domain/types";

export const enum BootState {
	IDLE = "IDLE",
	LOADING = "LOADING",
	READY = "READY",
	FAILED = "FAILED",
	UNLOADED = "UNLOADED",
}

export interface BootResult {
	readonly mods: Modules;
	readonly core: CoreModules;
}

export class Bootstrapper {
	private _state: BootState = BootState.IDLE;
	private _gen = 0;
	private _bootPromise: Promise<Result<BootResult>> | null = null;
	private readonly loader: ModuleLoader;
	private readonly plugin: import("@/main").default;

	public constructor(plugin: import("@/main").default) {
		this.plugin = plugin;
		this.loader = new ModuleLoader(plugin.appName);
	}

	public get state(): BootState { return this._state; }
	public get generation(): number { return this._gen; }

	public async bootstrap(): Promise<Result<BootResult>> {
		const currentGen = this._gen;

		if (this._bootPromise !== null) {
			return await this._bootPromise;
		}

		this._bootPromise = this._executeBootstrap(currentGen);
		
		const res = await this._bootPromise;
		if (!res.ok) {
			if (this._state !== BootState.UNLOADED) {
				this._state = BootState.FAILED;
			}
			this._bootPromise = null;
			return safe.err(res.error);
		}
		
		return safe.ok(res.value);
	}

	public unload(): void {
		this._gen++;
		this._state = BootState.UNLOADED;
		this._bootPromise = null;
	}

	private async _executeBootstrap(g: number): Promise<Result<BootResult>> {
		this._state = BootState.LOADING;

		const coreRes = await this.loader.resolveCoreModules();
		if (!coreRes.ok) {
			return safe.err(coreRes.error);
		}
		const core = coreRes.value;

		const stale1Res = this._checkStale(g);
		if (!stale1Res.ok) {
			return safe.err(stale1Res.error);
		}

		core.container.register("plugin", core.asValue(this.plugin));

		const modsRes = await this.loader.resolveAllModules();
		if (!modsRes.ok) {
			return safe.err(modsRes.error);
		}
		const mods = modsRes.value;

		const stale2Res = this._checkStale(g);
		if (!stale2Res.ok) {
			return safe.err(stale2Res.error);
		}

		this._state = BootState.READY;
		return safe.ok({ mods, core });
	}

	public isStale(g: number): boolean {
		return g !== this._gen || this._state === BootState.UNLOADED;
	}

	private _checkStale(g: number): Result<undefined> {
		if (this.isStale(g)) {
			return safe.err(new Error("Bootstrap cancelled: stale state"));
		}
		return safe.ok(undefined);
	}
}
