import { apiVersion } from "obsidian";
import { parse } from "valibot";

import { ERROR_MESSAGES } from "@/domain/errorMessages";
import { PluginManifestExSchema } from "@/domain/schemas";

import type { PluginManifest } from "obsidian";
import type {
	AcquisitionOptions,
	Cradle,
	OperationContext,
	OverrideRequest,
	PluginManifestEx,
	PreparedRelease,
	ReleaseFiles,
	ValidationContext,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

export type AcquisitionPhase = "resolving" | "compatibility" | "downloading" | "finalizing";

export interface ExtendedAcquisitionOptions extends AcquisitionOptions {
	readonly onPhase?: ((phase: AcquisitionPhase) => void) | undefined;
}

interface InternalAcquisitionPipelineContext {
	readonly validation: ValidationContext;
	readonly appCompat: {
		readonly isCompatible: boolean;
		readonly shouldProceed: boolean;
		readonly isIncompatibleFlag: boolean;
	};
	readonly releaseFiles?: Readonly<ReleaseFiles> | undefined;
	readonly manifestContent?: string | undefined;
	readonly baseManifest?: Readonly<PluginManifestEx> | undefined;
	readonly platformCompat?: {
		readonly shouldProceed: boolean;
		readonly overrideDesktopOnly: boolean;
	} | undefined;
}

export class PluginAcquisitionService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async acquireRelease(
		ctx: OperationContext,
		options: Readonly<ExtendedAcquisitionOptions>,
	): Promise<Result<PreparedRelease>> {
		return await ctx.safeCtx.async<PreparedRelease>(async ($) => {
			$.checkpoint();
			const { specifyVersion, context, preResolvedRelease, onPhase } = options;

			if (onPhase !== undefined) {
				onPhase("resolving");
			}

			console.info(`[Canary-Edge] [Acquisition] [${ctx.repo}] Resolving release metadata (version: '${specifyVersion !== "" ? specifyVersion : "latest"}')...`);

			let validation: ValidationContext;
			if (context !== undefined) {
				validation = context;
			} else if (preResolvedRelease !== undefined) {
				validation = $(await this.validateReleaseWithPreResolved(ctx, preResolvedRelease));
			} else {
				validation = $(
					await this.deps.repositoryService.validateAndFetchManifest(
						ctx,
						specifyVersion,
						ctx.overrides?.releaseChannel,
					),
				);
			}

			if (onPhase !== undefined) {
				onPhase("compatibility");
			}

			console.info(`[Canary-Edge] [Acquisition] [${ctx.repo}] Validating Obsidian version compatibility...`);
			let pipelineCtx = $(await this.checkAppCompat(ctx, validation));

			if (onPhase !== undefined) {
				onPhase("downloading");
			}

			console.info(`[Canary-Edge] [Acquisition] [${ctx.repo}] Downloading release assets...`);
			pipelineCtx = $(await this.downloadAssets(ctx, pipelineCtx));

			if (onPhase !== undefined) {
				onPhase("finalizing");
			}

			console.info(`[Canary-Edge] [Acquisition] [${ctx.repo}] Validating platform compatibility and manifest...`);
			pipelineCtx = $(await this.checkPlatformAndFinalizeManifest(ctx, pipelineCtx));

			return $(this.finalizePreparedRelease(ctx, pipelineCtx));
		});
	}

	private async handleOverrideRequest(
		ctx: OperationContext,
		requiresOverride: boolean,
		request: Readonly<OverrideRequest>,
		defaultErrorMessage: string,
	): Promise<Result<boolean>> {
		return await ctx.safeCtx.async<boolean>(async ($) => {
			$.checkpoint();
			if (requiresOverride === false || ctx.onOverrideRequest === undefined) {
				throw new Error(defaultErrorMessage);
			}

			const shouldProceed = $(await ctx.onOverrideRequest(request));
			if (shouldProceed === false) {
				throw new Error("Compatibility override rejected by user.");
			}

			return true;
		});
	}

	private async validateReleaseWithPreResolved(
		ctx: OperationContext,
		preResolved: Readonly<{ readonly release: import("@/domain/types").Release }>,
	): Promise<Result<ValidationContext>> {
		return await ctx.safeCtx.async<ValidationContext>(async ($) => {
			$.checkpoint();
			const usingBetaManifest = preResolved.release.prerelease;
			const res = $(await this.deps.repositoryService.validateRelease(ctx, preResolved.release));

			return { ...res, usingBetaManifest };
		});
	}

	private async checkAppCompat(
		ctx: OperationContext,
		validation: Readonly<ValidationContext>,
	): Promise<Result<InternalAcquisitionPipelineContext>> {
		return await ctx.safeCtx.async<InternalAcquisitionPipelineContext>(async ($) => {
			$.checkpoint();
			const compat = $(this.deps.pluginCompatibilityService.checkAppVersionCompatibility(validation.manifest, ctx));

			if (compat.isCompatible === true) {
				return { validation, appCompat: { isCompatible: true, shouldProceed: true, isIncompatibleFlag: false } };
			}

			const versionString = compat.minVersion ?? "unknown";
			const defaultError = `Requires Obsidian ${versionString}, but you have ${apiVersion}.`;

			$(
				await this.handleOverrideRequest(
					ctx,
					compat.requiresOverride,
					{
						type: "appVersion",
						repo: ctx.repo,
						minVersion: versionString,
						currentVersion: apiVersion,
					},
					defaultError,
				),
			);

			return {
				validation,
				appCompat: { isCompatible: false, shouldProceed: true, isIncompatibleFlag: true },
			};
		});
	}

	private async downloadAssets(
		ctx: OperationContext,
		pipelineCtx: Readonly<InternalAcquisitionPipelineContext>,
	): Promise<Result<InternalAcquisitionPipelineContext>> {
		return await ctx.safeCtx.async<InternalAcquisitionPipelineContext>(async ($) => {
			$.checkpoint();
			const assets = $(await this.deps.repositoryService.downloadReleaseAssets(ctx, pipelineCtx.validation.release));

			return {
				...pipelineCtx,
				releaseFiles: {
					mainJs: assets.mainJs,
					styles: assets.styles,
					manifest: null,
				},
			};
		});
	}

	private async checkPlatformAndFinalizeManifest(
		ctx: OperationContext,
		pipelineCtx: Readonly<InternalAcquisitionPipelineContext>,
	): Promise<Result<InternalAcquisitionPipelineContext>> {
		return await ctx.safeCtx.async<InternalAcquisitionPipelineContext>(async ($) => {
			$.checkpoint();
			if (pipelineCtx.releaseFiles === undefined) {
				return pipelineCtx;
			}

			const manifestContent = JSON.stringify(pipelineCtx.validation.manifest, null, 4);
			const baseManifest = parse(PluginManifestExSchema, JSON.parse(manifestContent)) as PluginManifestEx;

			const compat = $(
				this.deps.pluginCompatibilityService.checkPlatformCompatibility(baseManifest as PluginManifest, ctx),
			);

			if (compat.isCompatible === true) {
				return {
					...pipelineCtx,
					manifestContent,
					baseManifest,
					platformCompat: { shouldProceed: true, overrideDesktopOnly: false },
				};
			}

			$(
				await this.handleOverrideRequest(
					ctx,
					compat.requiresOverride,
					{
						type: "platform",
						repo: ctx.repo,
						isDesktopOnly: true,
					},
					"Marked as Desktop Only. Installation aborted.",
				),
			);

			return {
				...pipelineCtx,
				manifestContent,
				baseManifest,
				platformCompat: { shouldProceed: true, overrideDesktopOnly: true },
			};
		});
	}

	private finalizePreparedRelease(
		ctx: OperationContext,
		pipelineCtx: Readonly<InternalAcquisitionPipelineContext>,
	): Result<PreparedRelease> {
		return ctx.safeCtx(($) => {
			$.checkpoint();
			if (
				pipelineCtx.releaseFiles === undefined ||
				pipelineCtx.baseManifest === undefined ||
				pipelineCtx.platformCompat === undefined ||
				pipelineCtx.manifestContent === undefined
			) {
				throw new Error("Incomplete acquisition context pipeline.");
			}

			const finalManifestObj = $(
				this.deps.manifestMutationService.prepareManifest(
					pipelineCtx.baseManifest,
					pipelineCtx.appCompat.isIncompatibleFlag,
					pipelineCtx.platformCompat.overrideDesktopOnly,
				),
			);

			let finalManifestContent = pipelineCtx.manifestContent;
			if (pipelineCtx.appCompat.isIncompatibleFlag || pipelineCtx.platformCompat.overrideDesktopOnly) {
				finalManifestContent = JSON.stringify(finalManifestObj, null, 4);
			}

			if (pipelineCtx.releaseFiles.mainJs === null) {
				throw new Error(ERROR_MESSAGES.MAIN_JS_MISSING);
			}

			return {
				manifest: finalManifestObj,
				files: { ...pipelineCtx.releaseFiles, manifest: finalManifestContent },
				isIncompatible: pipelineCtx.appCompat.isIncompatibleFlag,
			};
		});
	}
}
