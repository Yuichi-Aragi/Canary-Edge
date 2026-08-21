import { useQuery } from "@tanstack/react-query";

import { safe } from "@/utils/safe";
import { useService } from "@/ui/hooks/useService";

export function usePluginId(repo: string): string | undefined {
	const pluginQueryService = useService("pluginQueryService");

	const { data } = useQuery({
		queryKey: ["pluginId", repo],
		queryFn: async (): Promise<string | undefined> => {
			if (repo === "") {
				return undefined;
			}
			const res = await pluginQueryService.getPluginIdByRepoOrName(repo);
			return safe.unwrapOr(res, undefined);
		},
		enabled: repo !== "",
		staleTime: 1000 * 60 * 30,
		gcTime: 1000 * 60 * 60,
		retry: 0,
	});

	return data;
}
