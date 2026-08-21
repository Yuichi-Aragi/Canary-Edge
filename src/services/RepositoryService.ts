import invariant from "tiny-invariant";
import { safeParse, type BaseIssue } from "valibot";

import { ERROR_MESSAGES } from "@/domain/errorMessages";
import { PluginManifestSchema } from "@/domain/schemas";
import { safe } from "@/utils/safe";
import { coerceVersion, compareVersions } from "@/utils/semverUtils";

import type { PluginManifest } from "obsidian";
import type {
	Cradle,
	OperationContext,
	Release,
	ReleaseChannel,
	RepositoryValidationResult,
	ValidationContext,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

export class RepositoryService {
	private readonly decoder = new TextDecoder("utf-8");
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async validateAndFetchManifest(
		ctx: OperationContext,
		specifyVersion: string,
		channel?: ReleaseChannel,
	): Promise<Result<ValidationContext>> {
		return await ctx.safeCtx.async<ValidationContext>(async ($) => {
			console.info(`[Canary-Edge] [Repository] [${ctx.repo}] Fetching and validating manifest for version '${specifyVersion !== "" ? specifyVersion : "latest"}'...`);
			const release = $(await this.resolveRelease(ctx, specifyVersion, channel));
			const usingBetaManifest = release.prerelease;

			const valRes = $(await this.validateRelease(ctx, release));
			const res: ValidationContext = { ...valRes, usingBetaManifest };

			invariant(
				Object.hasOwn(res.manifest, "version"),
				`The manifest.json file for ${ctx.repo} does not have a version number.`,
			);

			return res;
		});
	}

	public async resolveRelease(
		ctx: OperationContext,
		specifyVersion: string,
		channel?: ReleaseChannel,
	): Promise<Result<Release>> {
		return await ctx.safeCtx.async<Release>(async ($) => {
			console.info(`[Canary-Edge] [Repository] [${ctx.repo}] Resolving release (version: '${specifyVersion !== "" ? specifyVersion : "latest"}', channel: '${channel ?? "default"}')...`);
			$(await this.deps.gitHubRepositoryService.checkAccess(ctx.repo, ctx.token, ctx.safeCtx));

			if (specifyVersion !== "" && specifyVersion !== "latest") {
				return $(await this.fetchSpecificVersion(ctx, specifyVersion, channel));
			}

			return $(await this.fetchLatestVersion(ctx, channel));
		});
	}

	public async validateRelease(
		ctx: OperationContext,
		release: Readonly<Release>,
	): Promise<Result<RepositoryValidationResult>> {
		return await ctx.safeCtx.async<RepositoryValidationResult>(async ($) => {
			console.info(`[Canary-Edge] [Repository] [${ctx.repo}] Downloading manifest.json asset for tag '${release.tag_name}'...`);
			const buf = $(await this.deps.gitHubAssetService.downloadAsset(release, "manifest.json", ctx.token, ctx.safeCtx));

			if (buf === null || buf === undefined) {
				throw new Error(ERROR_MESSAGES.MANIFEST_MISSING);
			}

			const manifest = $(this.parseAndValidateManifest(ctx, this.decoder.decode(buf), release));
			return { manifest, release };
		});
	}

	public async downloadReleaseAssets(
		ctx: OperationContext,
		release: Readonly<Release>,
	): Promise<Result<{ readonly mainJs: ArrayBuffer | null; readonly styles: ArrayBuffer | null }>> {
		return await ctx.safeCtx.async<{ readonly mainJs: ArrayBuffer | null; readonly styles: ArrayBuffer | null }>(
			async ($) => {
				console.info(`[Canary-Edge] [Repository] [${ctx.repo}] Downloading assets (main.js, styles.css) for tag '${release.tag_name}'...`);
				const [mainJsRes, stylesRes] = await Promise.all([
					this.deps.gitHubAssetService.downloadAsset(release, "main.js", ctx.token, ctx.safeCtx),
					this.deps.gitHubAssetService.downloadAsset(release, "styles.css", ctx.token, ctx.safeCtx),
				]);

				const mainJs = $(mainJsRes);
				const styles = $(stylesRes);

				return {
					mainJs: mainJs !== undefined ? mainJs : null,
					styles: styles !== undefined ? styles : null,
				};
			},
		);
	}

	private async fetchSpecificVersion(
		ctx: OperationContext,
		version: string,
		overrideChannel?: ReleaseChannel,
	): Promise<Result<Release>> {
		return await ctx.safeCtx.async<Release>(async ($) => {
			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			const channel: ReleaseChannel = overrideChannel ?? ctx.overrides?.releaseChannel ?? config.releaseChannel ?? "stable";
			const release = $(
				await this.deps.gitHubReleaseService.grabReleaseFromRepository(
					ctx.repo,
					version,
					channel,
					ctx.token,
					ctx.safeCtx,
				),
			);

			invariant(release !== undefined && release !== null, ERROR_MESSAGES.NO_RELEASES);
			return release;
		});
	}

	private async fetchLatestVersion(
		ctx: OperationContext,
		overrideChannel?: ReleaseChannel,
	): Promise<Result<Release>> {
		return await ctx.safeCtx.async<Release>(async ($) => {
			const releases = $(await this.deps.gitHubReleaseService.getReleases(ctx.repo, ctx.token, ctx.safeCtx));

			if (releases === undefined || releases.length === 0) {
				throw new Error(ERROR_MESSAGES.NO_RELEASES);
			}

			const config = $(this.deps.settingsService.getPluginConfiguration(ctx.repo));
			const channel: ReleaseChannel = overrideChannel ?? ctx.overrides?.releaseChannel ?? config.releaseChannel ?? "stable";

			const bestRelease = $(this.deps.gitHubReleaseService.selectBestRelease(releases, channel));

			if (bestRelease === undefined || bestRelease === null) {
				throw new Error(`${ERROR_MESSAGES.NO_RELEASES} for release channel '${channel}'.`);
			}

			return bestRelease;
		});
	}

	private parseAndValidateManifest(
		ctx: OperationContext,
		raw: string,
		release: Readonly<Release>,
	): Result<PluginManifest> {
		return ctx.safeCtx((): PluginManifest => {
			const parseRes = safe.try((): unknown => {
				return JSON.parse(raw);
			});

			if (parseRes.ok === false) {
				const jsonErr = parseRes.error;
				const errDetail = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
				throw new Error(`${ERROR_MESSAGES.MANIFEST_INVALID} Malformed JSON in manifest for ${ctx.repo}: ${errDetail}`);
			}

			const manifestJson: unknown = parseRes.value;
			const validationResult = safeParse(PluginManifestSchema, manifestJson);

			if (validationResult.success === false) {
				const issues = validationResult.issues
					.map((i: BaseIssue<unknown>): string => {
						return i.message;
					})
					.join(", ");
				throw new Error(`${ERROR_MESSAGES.MANIFEST_INVALID} Details: ${issues}`);
			}

			const manifest = validationResult.output as PluginManifest;
			const expectedVersion = coerceVersion(release.tag_name, { includePrerelease: true, loose: true });
			const manifestVersion = coerceVersion(manifest.version, { includePrerelease: true, loose: true });

			if (
				expectedVersion !== null &&
				manifestVersion !== null &&
				compareVersions(expectedVersion, manifestVersion) !== 0
			) {
				console.info(
					`[Canary-Edge] [Repository] Version mismatch for ${ctx.repo}: Release ${release.tag_name} vs Manifest ${manifest.version}. Using Release version.`,
				);
				manifest.version = expectedVersion.version;
			}

			return manifest;
		});
	}
}
