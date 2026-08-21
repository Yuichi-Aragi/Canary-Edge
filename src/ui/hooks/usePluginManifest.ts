import { useQuery } from "@tanstack/react-query";

import { usePluginId } from "@/ui/hooks/usePluginId";
import { safe } from "@/utils/safe";
import { useService } from "@/ui/hooks/useService";

import type { UseQueryResult } from "@tanstack/react-query";
import type { PluginManifest } from "obsidian";

export function usePluginManifest(repo: string): UseQueryResult<PluginManifest | null> {
	const queryService = useService("pluginQueryService");
	const pluginId = usePluginId(repo);

	return useQuery({
		queryKey: ["manifest", repo, pluginId],
		queryFn: async (): Promise<PluginManifest | null> => {
			if (pluginId === undefined || pluginId === "") {
				return null;
			}
			return safe.unwrapOr(await queryService.getLocalManifest(pluginId), null);
		},
		enabled: repo !== "" && pluginId !== undefined,
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 10,
		retry: 0,
	});
}
