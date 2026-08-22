import Dexie, { type Table } from "dexie";

import { safe } from "@/utils/safe";

import type { Result } from "@/utils/safe";
import type { CommunityPlugin } from "@/domain/types";

export interface CachedCommunityPlugin {
	readonly id: string;
	readonly name: string;
	readonly author: string;
	readonly description: string;
	readonly repo: string;
}

export class CanaryEdgeDatabase extends Dexie {
	public readonly communityPlugins!: Table<CachedCommunityPlugin, string>;

	public constructor() {
		super("CanaryEdgeDB");
		this.version(1).stores({
			communityPlugins: "id, repo",
		});
	}
}

export class IndexedDBService {
	private readonly safeCtx = safe.bind(this);
	private readonly db = new CanaryEdgeDatabase();
	private disposed = false;

	public async countCommunityPlugins(): Promise<Result<number>> {
		return this.safeCtx.async<number>(async ($) => {
			$.checkpoint();

			const count = $(
				await safe.tryAsync(async (): Promise<number> => {
					return this.db.communityPlugins.count();
				}),
			);
			return count;
		});
	}

	public async hasCommunityPlugins(): Promise<Result<boolean>> {
		return this.safeCtx.async<boolean>(async ($) => {
			$.checkpoint();

			const count = $(await this.countCommunityPlugins());
			return count > 0;
		});
	}

	public async saveCommunityPlugins(plugins: readonly CommunityPlugin[]): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($) => {
			$.checkpoint();

			$(
				await safe.tryAsync(async (): Promise<void> => {
					await this.db.transaction("rw", this.db.communityPlugins, async (): Promise<void> => {
						await this.db.communityPlugins.clear();
						const records = plugins.map((p): CachedCommunityPlugin => {
							return {
								id: p.id,
								name: p.name,
								author: p.author,
								description: p.description,
								repo: p.repo,
							};
						});
						await this.db.communityPlugins.bulkPut(records);
					});
				}),
			);

			return undefined;
		});
	}

	public async getCommunityPlugins(): Promise<Result<CommunityPlugin[]>> {
		return this.safeCtx.async<CommunityPlugin[]>(async ($) => {
			$.checkpoint();

			const plugins = $(
				await safe.tryAsync(async (): Promise<CachedCommunityPlugin[]> => {
					return this.db.communityPlugins.toArray();
				}),
			);
			return plugins;
		});
	}

	public async getPluginByIdOrRepo(repoOrName: string): Promise<Result<CommunityPlugin | undefined>> {
		return this.safeCtx.async<CommunityPlugin | undefined>(async ($) => {
			$.checkpoint();

			const normalized = repoOrName.trim().toLowerCase();
			if (normalized === "") {
				return undefined;
			}

			const result = $(
				await safe.tryAsync(async (): Promise<CachedCommunityPlugin | undefined> => {
					const byId = await this.db.communityPlugins.get(normalized);
					if (byId !== undefined) {
						return byId;
					}

					const matched = await this.db.communityPlugins
						.filter((p): boolean => {
							return (
								p.repo.toLowerCase() === normalized ||
								p.id.toLowerCase() === normalized ||
								p.repo.toLowerCase().endsWith(`/${normalized}`)
							);
						})
						.first();

					return matched;
				}),
			);

			return result;
		});
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.db.close();
	}
}
