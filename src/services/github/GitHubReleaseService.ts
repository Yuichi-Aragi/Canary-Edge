import { array, parse } from "valibot";
import { match } from "ts-pattern";

import { ReleaseSchema } from "@/domain/schemas";
import { parseRepositoryPath, resolveApiContext, resolveToken } from "@/utils/contextUtils";
import { safe } from "@/utils/safe";
import { coerceVersion, compareVersions } from "@/utils/semverUtils";

import type { Result, Api } from "@/utils/safe";
import type { 
	Cradle,
	Release, 
	ReleaseChannel,
	ReleaseVersion,
	OperationContext
} from "@/domain/types";

const isBetaPrerelease = (release: Readonly<Release>): boolean => {
	const parsed = coerceVersion(release.tag_name, { includePrerelease: true, loose: true });
	const hasBetaInPrerelease = parsed?.prerelease.some((id: string | number): boolean => {
		return String(id).toLowerCase().includes("beta");
	}) ?? false;

	return hasBetaInPrerelease || release.tag_name.toLowerCase().includes("beta");
};

export const filterReleasesByChannel = (
	releases: readonly Release[],
	channel: ReleaseChannel,
): Release[] => {
	return releases.filter((release: Readonly<Release>): boolean => {
		if (release.draft === true) {
			return false;
		}

		return match(channel)
			.with("stable", (): boolean => {
				return release.prerelease === false;
			})
			.with("beta", (): boolean => {
				return release.prerelease === false ? true : isBetaPrerelease(release);
			})
			.with("canary", (): boolean => {
				return true;
			})
			.exhaustive();
	});
};

const resolveReleaseChannel = (
	channelOrIncludePrereleases: ReleaseChannel | boolean,
): ReleaseChannel => {
	if (typeof channelOrIncludePrereleases === "boolean") {
		return channelOrIncludePrereleases === true ? "canary" : "stable";
	}
	return channelOrIncludePrereleases;
};

export class GitHubReleaseService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	private async fetchReleasesApi(
		owner: string,
		repo: string,
		accessToken: string,
		safeCtx: ReturnType<typeof safe.from>,
		$: <T>(val: Result<T> | T) => T,
		perPage: number,
		page: number,
	): Promise<Release[]> {
		const safePerPage = Math.max(1, Math.min(perPage, 100));
		const safePage = Math.max(1, page);

		const octokit = $(this.deps.gitHubClient.getOctokit(accessToken, safeCtx));
		const response = await octokit.repos.listReleases({
			owner,
			repo,
			per_page: safePerPage,
			page: safePage,
		});

		if (Array.isArray(response.data) === false) {
			return [];
		}

		return parse(array(ReleaseSchema), response.data);
	}

	public async fetchReleaseVersions(
		repository: string, 
		token = "", 
		channel?: ReleaseChannel,
		ctx?: OperationContext | Api | AbortSignal,
		perPage = 100,
		page = 1,
	): Promise<Result<ReleaseVersion[] | null>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<ReleaseVersion[] | null>(async ($) => {
			const repoInfo = parseRepositoryPath(repository);
			if (repoInfo === null) {
				return null;
			}

			const parsedReleases = await this.fetchReleasesApi(
				repoInfo.owner,
				repoInfo.repo,
				effectiveToken,
				safeCtx,
				$,
				perPage,
				page,
			);

			const candidates = channel !== undefined 
				? filterReleasesByChannel(parsedReleases, channel)
				: parsedReleases.filter((r: Readonly<Release>): boolean => {
					return r.draft === false;
				});

			return candidates.map((r: Readonly<Release>): ReleaseVersion => {
				return {
					version: r.tag_name,
					prerelease: r.prerelease,
					publishedAt: r.published_at,
				};
			});
		});
	}

	public async getReleases(
		repositoryPath: string, 
		token = "", 
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<Release[]>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<Release[]>(async ($) => {
			const repoInfo = parseRepositoryPath(repositoryPath);
			if (repoInfo === null) {
				return [];
			}

			const parsedReleases = await this.fetchReleasesApi(
				repoInfo.owner,
				repoInfo.repo,
				effectiveToken,
				safeCtx,
				$,
				30,
				1,
			);

			return parsedReleases.filter((r: Readonly<Release>): boolean => {
				return r.draft === false;
			});
		});
	}

	public async grabReleaseFromRepository(
		repositoryPath: string,
		version?: string,
		channelOrIncludePrereleases: ReleaseChannel | boolean = "stable",
		token = "",
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<Release | null>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<Release | null>(async ($) => {
			const repoInfo = parseRepositoryPath(repositoryPath);
			if (repoInfo === null) {
				return null;
			}

			if (typeof version === "string" && version !== "" && version !== "latest") {
				const octokit = $(this.deps.gitHubClient.getOctokit(effectiveToken, safeCtx));
				const resVal = await octokit.repos.getReleaseByTag({
					owner: repoInfo.owner,
					repo: repoInfo.repo,
					tag: version,
				});

				const parsedRelease = parse(ReleaseSchema, resVal.data);
				if (parsedRelease.draft === true) {
					return null;
				}

				return parsedRelease;
			}

			const releases = $(await this.getReleases(repositoryPath, effectiveToken, safeCtx));
			if (releases.length === 0) {
				return null;
			}

			return $(this.selectBestRelease(releases, channelOrIncludePrereleases));
		});
	}

	public selectBestRelease(
		releases: readonly Release[], 
		channelOrIncludePrereleases: ReleaseChannel | boolean = "stable",
	): Result<Release | null> {
		return this.safeCtx(() => {
			if (releases.length === 0) {
				return null;
			}

			const channel = resolveReleaseChannel(channelOrIncludePrereleases);
			const candidates = filterReleasesByChannel(releases, channel);
			if (candidates.length === 0) {
				return null;
			}

			const mappedCandidates = candidates.map((release: Readonly<Release>) => {
				return {
					release,
					version: coerceVersion(release.tag_name, { includePrerelease: true, loose: true }),
					timestamp: new Date(release.published_at).getTime(),
				};
			});

			mappedCandidates.sort((a, b): number => {
				const av = a.version;
				const bv = b.version;
				
				if (av !== null && bv !== null) {
					const comp = compareVersions(bv, av);
					if (comp !== 0) {
						return comp;
					}
				} else if (av !== null && bv === null) {
					return -1;
				} else if (av === null && bv !== null) {
					return 1;
				}
				return b.timestamp - a.timestamp;
			});

			return mappedCandidates[0]?.release ?? null;
		});
	}
}
