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
		if (release.draft) {
			return false;
		}

		return match(channel)
			.with("stable", (): boolean => {
				return !release.prerelease;
			})
			.with("beta", (): boolean => {
				return !release.prerelease ? true : isBetaPrerelease(release);
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
		return channelOrIncludePrereleases ? "canary" : "stable";
	}
	return channelOrIncludePrereleases;
};

interface FetchReleasesApiParams {
	readonly owner: string;
	readonly repo: string;
	readonly accessToken: string;
	readonly safeCtx: ReturnType<typeof safe.from>;
	readonly $: <T>(val: Result<T> | T) => T;
	readonly perPage: number;
	readonly page: number;
}

export interface FetchReleaseVersionsOptions {
	readonly token?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
	readonly ctx?: OperationContext | Api | AbortSignal | undefined;
	readonly perPage?: number | undefined;
	readonly page?: number | undefined;
}

export interface GrabReleaseOptions {
	readonly version?: string | undefined;
	readonly channelOrIncludePrereleases?: ReleaseChannel | boolean | undefined;
	readonly token?: string | undefined;
	readonly ctx?: OperationContext | Api | AbortSignal | undefined;
}

export class GitHubReleaseService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	private async fetchReleasesApi(params: Readonly<FetchReleasesApiParams>): Promise<Release[]> {
		const { owner, repo, accessToken, safeCtx, $, perPage, page } = params;
		const safePerPage = Math.max(1, Math.min(perPage, 100));
		const safePage = Math.max(1, page);

		const octokit = $(this.deps.gitHubClient.getOctokit(accessToken, safeCtx));
		const response = await octokit.repos.listReleases({
			owner,
			repo,
			per_page: safePerPage,
			page: safePage,
		});

		if (!Array.isArray(response.data)) {
			return [];
		}

		return parse(array(ReleaseSchema), response.data);
	}

	public async fetchReleaseVersions(
		repository: string,
		options?: Readonly<FetchReleaseVersionsOptions>,
	): Promise<Result<ReleaseVersion[] | null>> {
		const token = options?.token ?? "";
		const channel = options?.channel;
		const ctx = options?.ctx;
		const perPage = options?.perPage ?? 100;
		const page = options?.page ?? 1;

		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return safeCtx.async<ReleaseVersion[] | null>(async ($) => {
			const repoInfo = parseRepositoryPath(repository);
			if (repoInfo === null) {
				return null;
			}

			const parsedReleases = await this.fetchReleasesApi({
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				accessToken: effectiveToken,
				safeCtx,
				$,
				perPage,
				page,
			});

			const candidates = channel !== undefined 
				? filterReleasesByChannel(parsedReleases, channel)
				: parsedReleases.filter((r: Readonly<Release>): boolean => {
					return !r.draft;
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

		return safeCtx.async<Release[]>(async ($) => {
			const repoInfo = parseRepositoryPath(repositoryPath);
			if (repoInfo === null) {
				return [];
			}

			const parsedReleases = await this.fetchReleasesApi({
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				accessToken: effectiveToken,
				safeCtx,
				$,
				perPage: 30,
				page: 1,
			});

			return parsedReleases.filter((r: Readonly<Release>): boolean => {
				return !r.draft;
			});
		});
	}

	public async grabReleaseFromRepository(
		repositoryPath: string,
		options?: Readonly<GrabReleaseOptions>,
	): Promise<Result<Release | null>> {
		const version = options?.version;
		const channelOrIncludePrereleases = options?.channelOrIncludePrereleases ?? "stable";
		const token = options?.token ?? "";
		const ctx = options?.ctx;

		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return safeCtx.async<Release | null>(async ($) => {
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
				if (parsedRelease.draft) {
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