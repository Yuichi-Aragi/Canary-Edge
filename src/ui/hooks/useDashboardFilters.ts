import { useState, useMemo, useCallback, useDeferredValue, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { useBoolean } from "@/ui/hooks/useBoolean";
import { useFuzzySearch } from "@/ui/hooks/useFuzzySearch";
import { useService } from "@/ui/hooks/useService";
import { useCanaryState, useCanaryActions } from "@/ui/hooks/useCanaryStore";
import { scrubRepositoryUrl } from "@/utils/stringUtils";
import { safe } from "@/utils/safe";

import type { DashboardFilterType, PluginConfig, Settings } from "@/domain/types";
import type { PluginManifest } from "obsidian";
import type { BidirectionalMapping } from "@/services/PluginQueryService";
import type { ActiveInstallOperation } from "@/ui/hooks/useMutationTracker";

type FilterType = DashboardFilterType;

interface SearchableDashboardItem extends Record<string, unknown> {
	readonly repo: string;
	readonly name: string;
}

export interface UseDashboardFiltersOptions {
	readonly settings: Readonly<Settings>;
	readonly activeInstallations: readonly ActiveInstallOperation[];
}

export interface UseDashboardFiltersResult {
	readonly searchQuery: string;
	readonly showSearch: boolean;
	readonly activeFilters: ReadonlySet<FilterType>;
	readonly filteredPlugins: readonly string[];
	readonly frozenVersions: Map<string, PluginConfig>;
	readonly isLoading: boolean;
	readonly isRefetching: boolean;
	readonly setSearchQuery: (query: string) => void;
	readonly setShowSearch: (show: boolean) => void;
	readonly toggleFilter: (filter: FilterType) => void;
	readonly clearSearch: () => void;
}

const DASHBOARD_SEARCH_KEYS = ["repo", "name"] as const;

function extractRepoName(repo: string): string {
	const scrubbed = scrubRepositoryUrl(repo).toLowerCase().trim();
	if (scrubbed.includes("/")) {
		return scrubbed.split("/")[1] ?? scrubbed;
	}
	const repoLower = repo.toLowerCase().trim();
	if (repoLower.includes("/")) {
		return repoLower.split("/")[1] ?? repoLower;
	}
	return repoLower;
}

export function useDashboardFilters({
	settings,
	activeInstallations,
}: UseDashboardFiltersOptions): UseDashboardFiltersResult {
	const [searchQuery, setSearchQuery] = useState<string>("");
	const deferredSearchQuery = useDeferredValue(searchQuery);

	const [showSearch, { set: setShowSearch }] = useBoolean(false);
	const pluginQueryService = useService("pluginQueryService");

	const rawActiveFilters = useCanaryState((state) => {
		return state.ui.activeDashboardFilters;
	});
	const toggleDashboardFilter = useCanaryActions((actions) => {
		return actions.toggleDashboardFilter;
	});
	const setActiveDashboardFilters = useCanaryActions((actions) => {
		return actions.setActiveDashboardFilters;
	});

	useEffect((): void => {
		if (rawActiveFilters.includes("installing") === true && activeInstallations.length === 0) {
			const nextFilters = rawActiveFilters.filter((f): boolean => {
				return f !== "installing";
			});
			setActiveDashboardFilters(nextFilters);
		}
	}, [rawActiveFilters, activeInstallations.length, setActiveDashboardFilters]);

	const activeFilters = useMemo((): ReadonlySet<FilterType> => {
		return new Set(rawActiveFilters);
	}, [rawActiveFilters]);

	const frozenVersions = useMemo((): Map<string, PluginConfig> => {
		return new Map(Object.entries(settings.plugins));
	}, [settings.plugins]);

	const {
		data: installedPluginsData,
		isLoading: isInstalledPluginsLoading,
		isFetching: isInstalledPluginsFetching,
	} = useQuery<readonly PluginManifest[]>({
		queryKey: ["plugins", "installed"],
		queryFn: (): readonly PluginManifest[] => {
			const res = pluginQueryService.getAllInstalledPlugins();
			return safe.unwrapOr(res, []);
		},
		staleTime: 1000 * 60 * 2,
		gcTime: 1000 * 60 * 10,
	});

	const installedPlugins = useMemo((): readonly PluginManifest[] => {
		return installedPluginsData ?? [];
	}, [installedPluginsData]);

	const trackedRepos = useMemo((): readonly string[] => {
		return Object.keys(settings.plugins).sort((a, b): number => {
			return a.localeCompare(b);
		});
	}, [settings.plugins]);

	const {
		data: mappings,
		isLoading: isMappingsLoading,
		isFetching: isMappingsFetching,
	} = useQuery<BidirectionalMapping>({
		queryKey: ["trackedPluginMappings", trackedRepos],
		queryFn: async (): Promise<BidirectionalMapping> => {
			const res = await pluginQueryService.getBidirectionalMappings(trackedRepos);
			return safe.unwrapOr(res, { idToRepo: new Map(), repoToId: new Map() });
		},
		staleTime: 1000 * 60 * 10,
		gcTime: 1000 * 60 * 30,
	});

	const isInitialInstalledLoading = isInstalledPluginsLoading && installedPluginsData === undefined;
	const isInitialMappingsLoading = isMappingsLoading && mappings === undefined;
	const isInitialLoading = isInitialInstalledLoading || isInitialMappingsLoading;
	const isRefetching = isInstalledPluginsFetching || isMappingsFetching;

	const trackedIdentifiersSet = useMemo((): ReadonlySet<string> => {
		const set = new Set<string>();

		if (mappings !== undefined) {
			for (const [id] of mappings.idToRepo) {
				set.add(id.toLowerCase().trim());
			}
			for (const [, id] of mappings.repoToId) {
				set.add(id.toLowerCase().trim());
			}
		}

		for (const repoKey of Object.keys(settings.plugins)) {
			const repoLower = repoKey.toLowerCase().trim();
			const scrubbed = scrubRepositoryUrl(repoKey).toLowerCase().trim();
			const repoName = extractRepoName(repoKey);

			set.add(repoLower);
			set.add(scrubbed);
			set.add(repoName);

			if (repoLower.includes("/")) {
				const parts = repoLower.split("/");
				const lastPart = parts[parts.length - 1];
				if (lastPart !== undefined && lastPart !== "") {
					set.add(lastPart);
				}
			}

			if (scrubbed.includes("/")) {
				const scrubbedParts = scrubbed.split("/");
				const lastScrubbedPart = scrubbedParts[scrubbedParts.length - 1];
				if (lastScrubbedPart !== undefined && lastScrubbedPart !== "") {
					set.add(lastScrubbedPart);
				}
			}
		}

		return set;
	}, [settings.plugins, mappings]);

	const isTracked = useCallback(
		(manifestId: string): boolean => {
			const idLower = manifestId.toLowerCase().trim();
			if (idLower === "") {
				return false;
			}
			return trackedIdentifiersSet.has(idLower);
		},
		[trackedIdentifiersSet],
	);

	const untrackedPlugins = useMemo((): readonly PluginManifest[] => {
		if (isInitialLoading === true && installedPlugins.length === 0) {
			return [];
		}
		return installedPlugins.filter((manifest): boolean => {
			return isTracked(manifest.id) === false;
		});
	}, [installedPlugins, isTracked, isInitialLoading]);

	const manifestsMap = useMemo((): Map<string, PluginManifest> => {
		const map = new Map<string, PluginManifest>();
		for (const manifest of installedPlugins) {
			map.set(manifest.id.toLowerCase().trim(), manifest);
		}
		return map;
	}, [installedPlugins]);

	const searchableItems = useMemo((): readonly SearchableDashboardItem[] => {
		if (activeFilters.has("installing")) {
			return activeInstallations.map((op): SearchableDashboardItem => {
				return {
					repo: op.repo,
					name: extractRepoName(op.repo),
				};
			});
		}

		if (isInitialLoading === true && installedPlugins.length === 0 && Object.keys(settings.plugins).length === 0) {
			return [];
		}

		if (activeFilters.has("untracked")) {
			return untrackedPlugins.map((manifest): SearchableDashboardItem => {
				return {
					repo: manifest.id,
					name: manifest.name,
				};
			});
		}

		return Object.keys(settings.plugins).map((repo): SearchableDashboardItem => {
			const repoLower = repo.toLowerCase().trim();
			const pluginId = repoLower.includes("/") ? (repoLower.split("/")[1] ?? repoLower) : repoLower;
			const manifest = manifestsMap.get(pluginId);

			return {
				repo,
				name: manifest?.name ?? repo,
			};
		});
	}, [activeFilters, activeInstallations, settings.plugins, untrackedPlugins, manifestsMap, isInitialLoading, installedPlugins.length]);

	const fuzzyResults = useFuzzySearch(searchableItems, deferredSearchQuery, DASHBOARD_SEARCH_KEYS);

	const filteredPlugins = useMemo((): readonly string[] => {
		const query = deferredSearchQuery.trim();

		if (activeFilters.has("installing")) {
			if (query === "") {
				return activeInstallations.map((op): string => {
					return op.repo;
				});
			}
			return fuzzyResults.map((r): string => {
				return r.repo;
			});
		}

		if (isInitialLoading === true && searchableItems.length === 0) {
			return [];
		}

		let candidateRepos: readonly string[];
		if (query === "") {
			candidateRepos = searchableItems.map((item): string => {
				return item.repo;
			});
		} else {
			candidateRepos = fuzzyResults.map((r): string => {
				return r.repo;
			});
		}

		if (activeFilters.size === 0 || activeFilters.has("untracked")) {
			return candidateRepos;
		}

		return candidateRepos.filter((repo): boolean => {
			const frozenData = frozenVersions.get(repo);
			const isFrozen = frozenData?.status === "frozen";
			const isIncompatible = frozenData?.compatibility === "incompatible";

			return (activeFilters.has("frozen") && isFrozen) || (activeFilters.has("incompatible") && isIncompatible);
		});
	}, [activeFilters, activeInstallations, deferredSearchQuery, fuzzyResults, isInitialLoading, searchableItems, frozenVersions]);

	const toggleFilter = useCallback(
		(filter: FilterType): void => {
			toggleDashboardFilter(filter);
		},
		[toggleDashboardFilter],
	);

	const clearSearch = useCallback((): void => {
		setShowSearch(false);
		setSearchQuery("");
	}, [setShowSearch]);

	return {
		searchQuery,
		showSearch,
		activeFilters,
		filteredPlugins,
		frozenVersions,
		isLoading: isInitialLoading,
		isRefetching,
		setSearchQuery,
		setShowSearch,
		toggleFilter,
		clearSearch,
	};
}
