import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { useService } from "@/ui/hooks/useService";
import { assertInternetConnection, isConnectedToInternet } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";

import type { GitHubContentService } from "@/services/github/GitHubContentService";
import type { IndexedDBService } from "@/services/infrastructure/IndexedDBService";

let inFlightSyncPromise: Promise<boolean> | null = null;

export async function syncCommunityPlugins(
	contentService: Readonly<GitHubContentService>,
	indexedDbService: Readonly<IndexedDBService>,
	force = false,
): Promise<boolean> {
	if (inFlightSyncPromise !== null && !force) {
		return inFlightSyncPromise;
	}

	const syncTask = async (): Promise<boolean> => {
		const hasCacheRes = await indexedDbService.hasCommunityPlugins();
		const hasCache = safe.unwrapOr(hasCacheRes, false);

		if (hasCache && !force) {
			const isOnline = await isConnectedToInternet();
			if (!isOnline) {
				return true;
			}
		} else {
			await assertInternetConnection();
		}

		const listRes = await contentService.grabCommmunityPluginList();
		if (listRes.ok && listRes.value !== null && listRes.value.length > 0) {
			const saveRes = await indexedDbService.saveCommunityPlugins(listRes.value);
			if (!saveRes.ok) {
				throw saveRes.error;
			}
			return true;
		}

		if (hasCache && !force) {
			return true;
		}

		if (!listRes.ok) {
			throw listRes.error;
		}

		throw new Error("Received empty community plugin directory from remote repository.");
	};

	inFlightSyncPromise = syncTask();

	try {
		const result = await inFlightSyncPromise;
		return result;
	} finally {
		inFlightSyncPromise = null;
	}
}

export interface UseCommunityPluginsSyncResult {
	readonly isReady: boolean;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly error: Error | null;
	readonly retry: () => void;
}

export function useCommunityPluginsSync(): UseCommunityPluginsSyncResult {
	const contentService = useService("gitHubContentService");
	const indexedDbService = useService("indexedDbService");

	const query = useQuery<boolean>({
		queryKey: ["communityPluginsReady"],
		queryFn: async (): Promise<boolean> => {
			const hasCacheRes = await indexedDbService.hasCommunityPlugins();
			const hasCache = safe.unwrapOr(hasCacheRes, false);

			if (hasCache) {
				void syncCommunityPlugins(contentService, indexedDbService, false).catch((err: unknown): void => {
					console.warn("[Canary-Edge] Background community plugins sync encountered an issue:", err);
				});
				return true;
			}

			return syncCommunityPlugins(contentService, indexedDbService, false);
		},
		staleTime: 1000 * 60 * 60,
		gcTime: 1000 * 60 * 120,
		retry: 0,
		refetchOnWindowFocus: false,
	});

	const retry = useCallback((): void => {
		void query.refetch();
	}, [query]);

	return {
		isReady: query.data === true,
		isLoading: query.isLoading || (query.isFetching && query.data !== true),
		isError: query.isError,
		error: query.error,
		retry,
	};
}

export const useCommunityPlugins = useCommunityPluginsSync;
