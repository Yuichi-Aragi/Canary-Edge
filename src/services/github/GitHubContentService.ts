import MiniSearch from "minisearch";
import { requestUrl } from "obsidian";
import { array, parse } from "valibot";

import { CommunityPluginSchema } from "@/domain/schemas";
import { parseRepositoryPath, resolveApiContext, resolveToken } from "@/utils/contextUtils";
import { extractRawString } from "@/utils/httpUtils";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { Api, Result } from "@/utils/safe";
import type { CommunityPlugin, Cradle, OperationContext } from "@/domain/types";

const OBSIDIAN_ASSETS_URL = "https://community.obsidian.md/assets";
const EXACT_CHANGELOG_TARGETS = [
	"changelog.md",
	"changelog",
	"history.md",
] as const;

interface ChangelogFileDoc {
	readonly id: string;
	readonly name: string;
}

export class GitHubContentService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public async grabCommmunityPluginList(): Promise<Result<CommunityPlugin[] | null>> {
		return await this.safeCtx.async<CommunityPlugin[] | null>(async () => {
			await assertInternetConnection();

			const url = `${OBSIDIAN_ASSETS_URL}/community-plugins.json`;
			const res = await requestUrl({ url, throw: false });

			if (res.status !== 200) {
				if (res.status === 404) {
					return null;
				}
				throw new Error(`Failed to fetch community plugins: status code ${String(res.status)}`);
			}

			return parse(array(CommunityPluginSchema), res.json);
		});
	}

	public async fetchChangelogFile(
		repo: string,
		token = "",
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<string>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<string>(async ($) => {
			const repoInfo = parseRepositoryPath(repo);
			if (repoInfo === null) {
				throw new Error("Invalid repository format. Expected 'owner/repo'.");
			}

			const octokit = $(this.deps.gitHubClient.getOctokit(effectiveToken, safeCtx));

			const contentsRes = await octokit.repos.getContent({
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				path: "",
			});

			const contentsData = (contentsRes as { readonly data: unknown }).data;
			if (Array.isArray(contentsData) === false) {
				throw new Error("Repository root content is not a directory list.");
			}

			const mappedEntries = contentsData.flatMap(
				(item: unknown): readonly { readonly name: string }[] => {
					if (
						typeof item === "object" &&
						item !== null &&
						"name" in item &&
						typeof (item as { readonly name: unknown }).name === "string"
					) {
						return [{ name: (item as { readonly name: string }).name }];
					}
					return [];
				},
			);

			const matchedFilename = this.matchChangelogFilename(mappedEntries);
			if (matchedFilename === undefined) {
				throw new Error("No changelog file found in repository.");
			}

			const contentRes = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				path: matchedFilename,
				headers: { accept: "application/vnd.github.raw" },
			});

			return extractRawString(contentRes);
		});
	}

	public async fetchReadme(
		repo: string,
		token = "",
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<string>> {
		const safeCtx = safe.from(resolveApiContext(ctx)).bind(this);
		const effectiveToken = resolveToken(token, ctx);

		return await safeCtx.async<string>(async ($) => {
			const repoInfo = parseRepositoryPath(repo);
			if (repoInfo === null) {
				throw new Error("Invalid repository format. Expected 'owner/repo'.");
			}

			const octokit = $(this.deps.gitHubClient.getOctokit(effectiveToken, safeCtx));

			const response = await octokit.request("GET /repos/{owner}/{repo}/readme", {
				owner: repoInfo.owner,
				repo: repoInfo.repo,
				headers: { accept: "application/vnd.github.raw" },
			});

			return extractRawString(response);
		});
	}

	private matchChangelogFilename(
		entries: readonly { readonly name: string }[],
	): string | undefined {
		if (entries.length === 0) {
			return undefined;
		}

		const fileMap = new Map<string, string>();
		for (const item of entries) {
			fileMap.set(item.name.toLowerCase(), item.name);
		}

		for (const target of EXACT_CHANGELOG_TARGETS) {
			const found = fileMap.get(target);
			if (found !== undefined) {
				return found;
			}
		}

		const mdFiles = entries
			.map((item: { readonly name: string }): string => {
				return item.name;
			})
			.filter((fileName: string): boolean => {
				return fileName.toLowerCase().endsWith(".md") === true;
			});

		if (mdFiles.length > 0) {
			const miniSearch = new MiniSearch<ChangelogFileDoc>({
				fields: ["name"],
				storeFields: ["id", "name"],
				idField: "id",
			});

			const docs: ChangelogFileDoc[] = mdFiles.map(
				(filename: string, index: number): ChangelogFileDoc => {
					return { id: String(index), name: filename };
				},
			);

			miniSearch.addAll(docs);

			const results = miniSearch.search("changelog", {
				prefix: true,
				fuzzy: (term: string): number | false => {
					return term.length >= 3 ? 0.2 : false;
				},
				combineWith: "AND",
			});

			const topMatch = results[0];
			if (topMatch !== undefined) {
				const matchedIndex = Number(topMatch.id);
				const matchedFile = mdFiles[matchedIndex];
				if (matchedFile !== undefined) {
					return matchedFile;
				}
			}
		}

		return undefined;
	}
}
