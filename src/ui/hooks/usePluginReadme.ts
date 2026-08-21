import { useQuery } from "@tanstack/react-query";

import { useService } from "@/ui/hooks/useService";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";
import { rewriteMdResourceUrls } from "@/utils/url-rewriter";

import type { UseQueryResult } from "@tanstack/react-query";

export function usePluginReadme(
	repoUrl: string,
	localTokenSecretId?: string,
	isEnabled = true,
): UseQueryResult<string> {
	const gitHubContentService = useService("gitHubContentService");
	const settingsService = useService("settingsService");
	const scrubbedRepo = repoUrl !== "" ? scrubRepositoryUrl(repoUrl) : "";

	return useQuery({
		queryKey: ["readme", scrubbedRepo, localTokenSecretId],
		queryFn: async (): Promise<string> => {
			if (scrubbedRepo === "") {
				throw new Error("Repository URL is empty");
			}

			await assertInternetConnection();

			const anonRes = await gitHubContentService.fetchReadme(scrubbedRepo, "");

			let rawMarkdown: string;

			if (anonRes.ok === true) {
				rawMarkdown = anonRes.value;
			} else {
				const effectiveTokenRes = settingsService.getEffectiveTokenForRepo(scrubbedRepo, localTokenSecretId);
				const effectiveToken = safe.unwrapOr(effectiveTokenRes, "");

				if (effectiveToken !== "") {
					const tokenRes = await gitHubContentService.fetchReadme(scrubbedRepo, effectiveToken);
					if (tokenRes.ok === false) {
						throw tokenRes.error;
					}
					rawMarkdown = tokenRes.value;
				} else {
					throw anonRes.error;
				}
			}

			const rewriteRes = rewriteMdResourceUrls(rawMarkdown, scrubbedRepo, "HEAD");
			if (rewriteRes.ok === false) {
				return rawMarkdown;
			}

			return rewriteRes.value;
		},
		enabled: scrubbedRepo !== "" && isEnabled,
		staleTime: 1000 * 60 * 15,
		gcTime: 1000 * 60 * 30,
		retry: 0,
	});
}
