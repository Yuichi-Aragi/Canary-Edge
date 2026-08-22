import { requireApiVersion, Platform } from "obsidian";

import type { PluginManifest } from "obsidian";
import type { Result } from "@/utils/safe";
import type { Cradle, OperationContext } from "@/domain/types";

export interface AppCompatibilityResult {
	readonly isCompatible: boolean;
	readonly requiresOverride: boolean;
	readonly minVersion?: string | undefined;
}

export interface PlatformCompatibilityResult {
	readonly isCompatible: boolean;
	readonly requiresOverride: boolean;
}

export interface OverallCompatibilityResult {
	readonly isCompatible: boolean;
	readonly appCompat: AppCompatibilityResult;
	readonly platformCompat: PlatformCompatibilityResult;
}

export class PluginCompatibilityService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public checkAppVersionCompatibility(
		manifest: Readonly<PluginManifest>,
		ctx: OperationContext
	): Result<AppCompatibilityResult> {
		return ctx.safeCtx(($) => {
			const { minAppVersion } = manifest;
			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			
			const allowIncompatibleMiniVersion = ctx.overrides?.forceInstall?.version ?? config.forceInstall.version;

			if (minAppVersion === "" || allowIncompatibleMiniVersion) {
				return { isCompatible: true, requiresOverride: false };
			}

			const isCompatible = requireApiVersion(minAppVersion);
			if (isCompatible) {
				return { isCompatible: true, requiresOverride: false };
			}

			return { isCompatible: false, requiresOverride: true, minVersion: minAppVersion };
		});
	}

	public checkPlatformCompatibility(
		manifest: Readonly<PluginManifest>,
		ctx: OperationContext
	): Result<PlatformCompatibilityResult> {
		return ctx.safeCtx(($) => {
			const { isMobile } = Platform;
			const { isDesktopOnly } = manifest;
			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			
			const allowIncompatiblePlatform = ctx.overrides?.forceInstall?.platform ?? config.forceInstall.platform;

			if (!isMobile || isDesktopOnly !== true || allowIncompatiblePlatform) {
				return { isCompatible: true, requiresOverride: false };
			}

			return { isCompatible: false, requiresOverride: true };
		});
	}

	public checkOverallCompatibility(
		manifest: Readonly<PluginManifest>,
		ctx: OperationContext
	): Result<OverallCompatibilityResult> {
		return ctx.safeCtx(($) => {
			const appCompat = $(this.checkAppVersionCompatibility(manifest, ctx));
			const platformCompat = $(this.checkPlatformCompatibility(manifest, ctx));
			const isCompatible = appCompat.isCompatible && platformCompat.isCompatible;

			return {
				isCompatible,
				appCompat,
				platformCompat,
			};
		});
	}
}
