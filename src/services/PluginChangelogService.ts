import { safe } from "@/utils/safe";

import type {
	ChangelogPriority,
	Cradle,
	FetchChangelogOptions,
	OperationContext,
	ReleaseChannel,
	ShowChangelogConfig,
} from "@/domain/types";
import type { Result } from "@/utils/safe";

export interface FetchChangelogFallbackOptions {
	readonly version: string;
	readonly releaseChannel: ReleaseChannel;
	readonly preResolvedBody?: string | null | undefined;
	readonly priority?: ChangelogPriority | undefined;
}

export interface ChangelogWorkflowOptions {
	readonly version: string;
	readonly releaseChannel: ReleaseChannel;
	readonly preResolvedBody?: string | null | undefined;
	readonly showChangelog: ShowChangelogConfig;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
}

export class PluginChangelogService {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async fetchChangelog(
		ctx: OperationContext,
		options: Readonly<FetchChangelogOptions>,
	): Promise<Result<string>> {
		return await ctx.safeCtx.async<string>(async ($) => {
			const {
				repositoryPath,
				version = "latest",
				strategy = "fallback",
				priority = "release_notes",
				includePrerelease = true,
			} = options;

			console.info(
				`[Canary-Edge] [Changelog] [${repositoryPath}] Fetching changelog (version: '${version}', strategy: '${strategy}', priority: '${priority}')...`,
			);
			$(await this.deps.gitHubRepositoryService.checkAccess(repositoryPath, ctx.token, ctx.safeCtx));

			if (strategy === "release_notes") {
				return $(await this.fetchReleaseNotes(ctx, repositoryPath, version, includePrerelease));
			}

			if (strategy === "changelog_file") {
				return $(await this.fetchChangelogFile(ctx, repositoryPath));
			}

			if (priority === "changelog_file") {
				const primaryFileRes = await this.fetchChangelogFile(ctx, repositoryPath);
				if (primaryFileRes.ok === true) {
					return primaryFileRes.value;
				}
				console.info(
					`[Canary-Edge] [Changelog] [${repositoryPath}] Primary changelog file not found, falling back to release notes...`,
				);
				const fallbackNotesRes = await this.fetchReleaseNotes(ctx, repositoryPath, version, includePrerelease);
				if (fallbackNotesRes.ok === true) {
					return fallbackNotesRes.value;
				}
				throw new Error("Changelog file and release notes not found.");
			}

			const primaryNotesRes = await this.fetchReleaseNotes(ctx, repositoryPath, version, includePrerelease);
			if (primaryNotesRes.ok === true) {
				return primaryNotesRes.value;
			}
			console.info(
				`[Canary-Edge] [Changelog] [${repositoryPath}] Primary release notes not found, falling back to changelog file...`,
			);
			const fallbackFileRes = await this.fetchChangelogFile(ctx, repositoryPath);
			if (fallbackFileRes.ok === true) {
				return fallbackFileRes.value;
			}
			throw new Error("Release notes and changelog file not found.");
		});
	}

	public async fetchChangelogWithFallback(
		ctx: OperationContext,
		options: Readonly<FetchChangelogFallbackOptions>,
	): Promise<string> {
		const { version, releaseChannel, preResolvedBody, priority = "release_notes" } = options;
		const displayVersion = version !== "" ? version : "latest";

		if (priority === "release_notes" && typeof preResolvedBody === "string" && preResolvedBody.trim() !== "") {
			return preResolvedBody.trim();
		}

		if (priority === "changelog_file") {
			const fileRes = await this.fetchChangelog(ctx, {
				repositoryPath: ctx.repo,
				version: version !== "" && version !== "latest" ? version : "latest",
				strategy: "changelog_file",
				includePrerelease: releaseChannel !== "stable",
				releaseChannel,
				priority,
			});

			const fileChangelog = safe.unwrapOr(fileRes, "");
			if (fileChangelog.trim() !== "") {
				return fileChangelog.trim();
			}

			if (typeof preResolvedBody === "string" && preResolvedBody.trim() !== "") {
				return preResolvedBody.trim();
			}

			const notesRes = await this.fetchChangelog(ctx, {
				repositoryPath: ctx.repo,
				version: version !== "" && version !== "latest" ? version : "latest",
				strategy: "release_notes",
				includePrerelease: releaseChannel !== "stable",
				releaseChannel,
				priority,
			});

			const notesChangelog = safe.unwrapOr(notesRes, "");
			if (notesChangelog.trim() !== "") {
				return notesChangelog.trim();
			}

			return `No changelog or release notes provided for version ${displayVersion}.`;
		}

		const targetVersion = version !== "" && version !== "latest" ? version : "";
		const result = await this.fetchChangelog(ctx, {
			repositoryPath: ctx.repo,
			version: targetVersion !== "" ? targetVersion : "latest",
			strategy: "fallback",
			priority: "release_notes",
			includePrerelease: releaseChannel !== "stable",
			releaseChannel,
		});

		const changelog = safe.unwrapOr(result, "");
		if (changelog.trim() !== "") {
			return changelog.trim();
		}

		return `No changelog or release notes provided for version ${displayVersion}.`;
	}

	public async promptChangelogBefore(
		ctx: OperationContext,
		options: Readonly<ChangelogWorkflowOptions>,
	): Promise<Result<boolean>> {
		return await ctx.safeCtx.async<boolean>(async ($) => {
			if (options.showChangelog.mode !== "before") {
				return true;
			}

			console.info(
				`[Canary-Edge] [Changelog] [${ctx.repo}] Prompting changelog before proceeding for version '${options.version}' (priority: '${options.showChangelog.priority}')...`,
			);
			const changelog = await this.fetchChangelogWithFallback(ctx, {
				version: options.version,
				releaseChannel: options.releaseChannel,
				preResolvedBody: options.preResolvedBody,
				priority: options.showChangelog.priority,
			});

			if (options.onChangelogReady !== undefined) {
				options.onChangelogReady(changelog);
			}

			const proceedRes = $(
				await this.deps.uiService.confirmChangelog({
					repo: ctx.repo,
					version: options.version,
					changelog,
					mode: "before",
				}),
			);

			if (proceedRes === false) {
				console.info(`[Canary-Edge] [Changelog] Operation cancelled by user upon viewing changelog for '${ctx.repo}'.`);
				return false;
			}

			return true;
		});
	}

	public async notifyChangelogAfter(
		ctx: OperationContext,
		options: Readonly<ChangelogWorkflowOptions>,
	): Promise<void> {
		if (options.showChangelog.mode !== "after") {
			return;
		}

		console.info(
			`[Canary-Edge] [Changelog] [${ctx.repo}] Emitting post-operation changelog for version '${options.version}' (priority: '${options.showChangelog.priority}')...`,
		);
		const changelog = await this.fetchChangelogWithFallback(ctx, {
			version: options.version,
			releaseChannel: options.releaseChannel,
			preResolvedBody: options.preResolvedBody,
			priority: options.showChangelog.priority,
		});

		if (options.onChangelogReady !== undefined) {
			options.onChangelogReady(changelog);
		}

		await this.deps.uiService.displayChangelog({
			repo: ctx.repo,
			version: options.version,
			changelog,
			mode: "after",
		});
	}

	private async fetchReleaseNotes(
		ctx: OperationContext,
		repositoryPath: string,
		version: string,
		includePrerelease: boolean,
	): Promise<Result<string>> {
		return await ctx.safeCtx.async<string>(async (_$) => {
			const targetVersion = version === "latest" ? "" : version;
			const releaseResult = await this.deps.gitHubReleaseService.grabReleaseFromRepository(
				repositoryPath,
				targetVersion,
				includePrerelease,
				ctx.token,
				ctx.safeCtx,
			);
			if (releaseResult.ok === true) {
				const release = releaseResult.value;
				if (release !== null && typeof release.body === "string" && release.body.trim() !== "") {
					return release.body.trim();
				}
				throw new Error("Release notes not found or empty.");
			}
			throw releaseResult.error;
		});
	}

	private async fetchChangelogFile(
		ctx: OperationContext,
		repositoryPath: string,
	): Promise<Result<string>> {
		return await ctx.safeCtx.async<string>(async ($) => {
			const fileContent = $(
				await this.deps.gitHubContentService.fetchChangelogFile(repositoryPath, ctx.token, ctx.safeCtx),
			);
			if (fileContent !== undefined && fileContent.trim() !== "") {
				return fileContent.trim();
			}
			throw new Error("Changelog file not found or empty.");
		});
	}
}
