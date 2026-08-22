import { useMemo, useCallback, useRef, useState, useEffect, useDeferredValue } from "react";
import MiniSearch from "minisearch";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";

import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useBoolean } from "@/ui/hooks/useBoolean";
import { useModalListSearch } from "@/ui/hooks/useModalListSearch";
import { useService } from "@/ui/hooks/useService";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { assertInternetConnection } from "@/utils/internetconnection";
import { coerceVersion } from "@/utils/semverUtils";
import { scrubRepositoryUrl } from "@/utils/stringUtils";
import { safe, normalizeError } from "@/utils/safe";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { ReleaseVersion, ReleaseChannel } from "@/domain/types";

type VersionDomain =
	| "latest"
	| "stable"
	| "rc"
	| "beta"
	| "canary"
	| "nightly"
	| "dev"
	| "alpha";

interface VersionBadgeInfo {
	readonly text: string;
	readonly domain: VersionDomain;
	readonly weight: number;
	readonly description: string;
	readonly icon: string;
}

interface PrereleaseDomainSpec {
	readonly key: string;
	readonly info: VersionBadgeInfo;
}

const SPECIAL_BADGES: Readonly<Record<string, VersionBadgeInfo>> = {
	latest: {
		text: "LATEST",
		domain: "latest",
		weight: 100,
		description: "Always install the most recent release",
		icon: "sparkles",
	},
	__LOAD_MORE__: {
		text: "LOAD MORE",
		domain: "latest",
		weight: 0,
		description: "Fetch additional release versions from repository",
		icon: "download",
	},
	__ERROR_RETRY__: {
		text: "RETRY",
		domain: "canary",
		weight: 0,
		description: "Click to retry fetching versions",
		icon: "rotate-ccw",
	},
};

const STABLE_BADGE_INFO: VersionBadgeInfo = {
	text: "STABLE",
	domain: "stable",
	weight: 90,
	description: "Stable production release",
	icon: "tag",
};

const PRERELEASE_SPECS: readonly PrereleaseDomainSpec[] = [
	{
		key: "rc",
		info: {
			text: "RC",
			domain: "rc",
			weight: 80,
			description: "Release candidate",
			icon: "flag",
		},
	},
	{
		key: "beta",
		info: {
			text: "BETA",
			domain: "beta",
			weight: 70,
			description: "Beta feature pre-release",
			icon: "zap",
		},
	},
	{
		key: "canary",
		info: {
			text: "CANARY",
			domain: "canary",
			weight: 60,
			description: "Canary bleeding-edge build",
			icon: "flame",
		},
	},
	{
		key: "nightly",
		info: {
			text: "NIGHTLY",
			domain: "nightly",
			weight: 50,
			description: "Nightly development build",
			icon: "moon",
		},
	},
	{
		key: "dev",
		info: {
			text: "DEV",
			domain: "dev",
			weight: 40,
			description: "Development build",
			icon: "code",
		},
	},
	{
		key: "alpha",
		info: {
			text: "ALPHA",
			domain: "alpha",
			weight: 30,
			description: "Alpha pre-release",
			icon: "flask-conical",
		},
	},
];

function formatPublicationTime(publishedAt: string): string | null {
	if (publishedAt === "") {
		return null;
	}

	const dateRes = safe.try((): string | null => {
		const parsedDate = parseISO(publishedAt);
		if (!isValid(parsedDate)) {
			return null;
		}
		return formatDistanceToNow(parsedDate, { addSuffix: true });
	});

	return safe.unwrapOr(dateRes, null);
}

const getVersionBadgeInfo = (item: Readonly<ReleaseVersion>): VersionBadgeInfo => {
	const specialBadge = SPECIAL_BADGES[item.version];
	if (specialBadge !== undefined) {
		return specialBadge;
	}

	if (!item.prerelease) {
		return STABLE_BADGE_INFO;
	}

	const semver = coerceVersion(item.version, { includePrerelease: true, loose: true });
	const tagLower = item.version.toLowerCase();

	const preTag =
		semver !== null && semver.prerelease.length > 0
			? String(semver.prerelease[0]).toLowerCase()
			: "";

	const matchedSpec = PRERELEASE_SPECS.find(
		(spec: Readonly<PrereleaseDomainSpec>): boolean =>
			preTag.includes(spec.key) || tagLower.includes(spec.key),
	);

	if (matchedSpec !== undefined) {
		return matchedSpec.info;
	}

	const fallbackTag = preTag.length > 0 ? preTag.toUpperCase() : "PRE-RELEASE";
	return {
		text: fallbackTag,
		domain: "canary",
		weight: 20,
		description: "Pre-release version",
		icon: "alert-circle",
	};
};

export interface IndexedReleaseVersion extends ReleaseVersion {
	readonly badgeInfo: VersionBadgeInfo;
	readonly publishedTime: string | null;
	readonly searchKey: string;
	readonly domainWeight: number;
}

function indexVersionItem(item: Readonly<ReleaseVersion>): IndexedReleaseVersion {
	const badgeInfo = getVersionBadgeInfo(item);
	const publishedTime = formatPublicationTime(item.publishedAt);
	const searchKey =
		`${item.version} ${badgeInfo.text} ${badgeInfo.domain} ${badgeInfo.description}`.toLowerCase();
	return {
		version: item.version,
		prerelease: item.prerelease,
		publishedAt: item.publishedAt,
		badgeInfo,
		publishedTime,
		searchKey,
		domainWeight: badgeInfo.weight,
	};
}

const INDEXED_LATEST_ITEM: IndexedReleaseVersion = indexVersionItem({
	version: "latest",
	prerelease: false,
	publishedAt: "",
});

const INDEXED_LOAD_MORE_ITEM: IndexedReleaseVersion = indexVersionItem({
	version: "__LOAD_MORE__",
	prerelease: false,
	publishedAt: "",
});

const INDEXED_ERROR_RETRY_ITEM: IndexedReleaseVersion = indexVersionItem({
	version: "__ERROR_RETRY__",
	prerelease: false,
	publishedAt: "",
});

const GET_ITEM_ID = (item: Readonly<IndexedReleaseVersion>): string => {
	return item.version;
};

const getFuzzyOption = (
	enableFuzzy: boolean,
): ((term: string) => number | false) | false => {
	if (!enableFuzzy) {
		return false;
	}
	return (term: string): number | false => {
		return term.length >= 3 ? 0.2 : false;
	};
};

export interface VersionSelectorViewState {
	readonly isOpen: boolean;
	readonly searchQuery: string;
	readonly deferredQuery: string;
	readonly filteredVersions: readonly IndexedReleaseVersion[];
	readonly displayValue: string;
	readonly showLatest: boolean;
	readonly listData: readonly IndexedReleaseVersion[];
	readonly listHeight: number;
	readonly activeIndex: number;
	readonly activeValue: string;
	readonly isLoadingMore: boolean;
	readonly hasMore: boolean;
	readonly isError: boolean;
	readonly errorMessage: string | null;
}

export interface VersionSelectorViewActions {
	readonly setIsOpen: (isOpen: boolean) => void;
	readonly openModal: () => void;
	readonly closeModal: () => void;
	readonly setSearchQuery: (query: string) => void;
	readonly handleSelect: (val: string) => void;
	readonly handleItemMouseEnter: (index: number) => void;
	readonly handleKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	readonly setActiveIndex: (index: number | ((prev: number) => number)) => void;
	readonly handleLoadMore: () => void;
	readonly handleRetry: () => void;
}

export interface VersionSelectorViewModelOptions {
	readonly value: string;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly onChange: (value: string) => void;
	readonly virtuosoRef?: RefObject<VirtuosoHandle | null> | undefined;
	readonly repoUrl?: string | undefined;
	readonly tokenSecretId?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
	readonly onLoadMore?: (() => Promise<void>) | undefined;
	readonly enableFuzzy?: boolean | undefined;
}

export interface VersionSelectorViewModel {
	readonly state: VersionSelectorViewState;
	readonly actions: VersionSelectorViewActions;
}

interface VersionMiniSearchDoc {
	readonly id: string;
	readonly version: string;
	readonly text: string;
	readonly domain: string;
	readonly description: string;
	readonly domainWeight: number;
}

export function useVersionSelectorViewModel(
	options: Readonly<VersionSelectorViewModelOptions>,
): VersionSelectorViewModel {
	const {
		value,
		versions: rawVersions,
		onChange,
		virtuosoRef,
		repoUrl,
		tokenSecretId,
		channel,
		onLoadMore: onLoadMoreProp,
	} = options;

	const enableFuzzy = options.enableFuzzy ?? true;

	const settingsService = useService("settingsService");
	const releaseService = useService("gitHubReleaseService");

	const [isOpenValue, { set: setIsOpen }] = useBoolean(false);
	const [isManualLoadingMore, { setTrue: setManualLoadingTrue, setFalse: setManualLoadingFalse }] =
		useBoolean(false);

	const [searchQuery, setSearchQuery] = useState<string>("");
	const deferredQuery: string = useDeferredValue(searchQuery);

	const { runTransition } = useTransitionAction();
	const [fetchErrorState, setFetchErrorState] = useState<string | null>(null);

	const mountedRef = useRef<boolean>(true);
	const isFetchingPageRef = useRef<boolean>(false);

	useEffect((): (() => void) => {
		mountedRef.current = true;
		return (): void => {
			mountedRef.current = false;
		};
	}, []);

	const scrubbedRepo = useMemo((): string => {
		if (repoUrl === undefined || repoUrl.trim() === "") {
			return "";
		}
		return scrubRepositoryUrl(repoUrl);
	}, [repoUrl]);

	const {
		data: infiniteData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isError: isInfiniteError,
		error: infiniteError,
		refetch: refetchInfinite,
	} = useInfiniteQuery({
		queryKey: ["versionSelectorInfinite", scrubbedRepo, channel, tokenSecretId],
		queryFn: async ({
			pageParam,
		}: {
			readonly pageParam: number;
		}): Promise<readonly ReleaseVersion[]> => {
			if (scrubbedRepo === "") {
				return [];
			}

			await assertInternetConnection();

			const effectiveTokenRes = settingsService.getEffectiveTokenForRepo(
				scrubbedRepo,
				tokenSecretId,
			);
			const effectiveToken = safe.unwrapOr(effectiveTokenRes, "");

			const fetchRes = await releaseService.fetchReleaseVersions(scrubbedRepo, {
				token: effectiveToken,
				channel,
				ctx: undefined,
				perPage: 100,
				page: pageParam,
			});

			if (!fetchRes.ok) {
				throw normalizeError(fetchRes.error);
			}

			if (fetchRes.value === null) {
				return [];
			}

			return fetchRes.value;
		},
		initialPageParam: 1,
		getNextPageParam: (
			lastPage: readonly ReleaseVersion[],
			allPages: readonly (readonly ReleaseVersion[])[],
		): number | undefined => {
			if (lastPage.length >= 100) {
				return allPages.length + 1;
			}
			return undefined;
		},
		gcTime: 1000 * 60 * 10,
		staleTime: 1000 * 60 * 5,
		retry: 1,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		enabled: isOpenValue && scrubbedRepo !== "" && onLoadMoreProp === undefined,
	});

	const combinedVersions = useMemo((): readonly ReleaseVersion[] => {
		const base = rawVersions ?? [];
		const dedupeMap = new Map<string, ReleaseVersion>();

		const addVersion = (item: Readonly<ReleaseVersion>): void => {
			const normTag = item.version.trim().toLowerCase();
			if (normTag !== "" && !dedupeMap.has(normTag)) {
				dedupeMap.set(normTag, item);
			}
		};

		base.forEach(addVersion);
		if (infiniteData !== undefined && infiniteData.pages.length > 0) {
			infiniteData.pages.forEach((page: readonly ReleaseVersion[]): void => {
				page.forEach(addVersion);
			});
		}

		return Array.from(dedupeMap.values());
	}, [rawVersions, infiniteData]);

	const indexedVersions = useMemo((): readonly IndexedReleaseVersion[] => {
		return combinedVersions.map((v: ReleaseVersion): IndexedReleaseVersion => {
			return indexVersionItem(v);
		});
	}, [combinedVersions]);

	const closeModal = useCallback((): void => {
		setIsOpen(false);
	}, [setIsOpen]);

	const hasMore = useMemo((): boolean => {
		if (onLoadMoreProp !== undefined) {
			return (rawVersions?.length ?? 0) >= 100;
		}
		return hasNextPage;
	}, [onLoadMoreProp, rawVersions, hasNextPage]);

	const handleLoadMore = useCallback((): void => {
		if (
			isFetchingPageRef.current ||
			isManualLoadingMore ||
			isFetchingNextPage
		) {
			return;
		}

		isFetchingPageRef.current = true;
		setManualLoadingTrue();
		setFetchErrorState(null);

		const toastId = canaryToast.loading("Loading additional release versions...");

		void (async (): Promise<void> => {
			const res = await safe.async(async (_$, defer): Promise<void> => {
				defer((): void => {
					isFetchingPageRef.current = false;
					setManualLoadingFalse();
				});

				await assertInternetConnection();

				if (onLoadMoreProp !== undefined) {
					await onLoadMoreProp();
					if (mountedRef.current) {
						canaryToast.success("Loaded additional versions.", { id: toastId });
					}
					return;
				}

				if (hasNextPage) {
					await fetchNextPage();
					if (mountedRef.current) {
						canaryToast.success("Loaded additional release versions.", { id: toastId });
					}
				} else if (mountedRef.current) {
					canaryToast.info("No further release versions available.", { id: toastId });
				}
			});

			if (!res.ok && mountedRef.current) {
				const msg = res.error.message;
				setFetchErrorState(msg);
				canaryToast.error(`Failed to load release versions: ${msg}`, { id: toastId });
			}
		})();
	}, [
		isManualLoadingMore,
		isFetchingNextPage,
		setManualLoadingTrue,
		setManualLoadingFalse,
		onLoadMoreProp,
		hasNextPage,
		fetchNextPage,
	]);

	const handleRetry = useCallback((): void => {
		setFetchErrorState(null);
		if (onLoadMoreProp === undefined) {
			void refetchInfinite();
		}
		handleLoadMore();
	}, [onLoadMoreProp, refetchInfinite, handleLoadMore]);

	const handleSelect = useCallback(
		(version: string): void => {
			if (version === "__LOAD_MORE__") {
				handleLoadMore();
				return;
			}
			if (version === "__ERROR_RETRY__") {
				handleRetry();
				return;
			}
			runTransition((): void => {
				onChange(version);
				closeModal();
			});
		},
		[onChange, closeModal, handleLoadMore, handleRetry, runTransition],
	);

	const isErrorCombined = isInfiniteError || fetchErrorState !== null;

	const filteredIndexedVersions = useMemo((): readonly IndexedReleaseVersion[] => {
		if (indexedVersions.length === 0) {
			return [];
		}
		const query = deferredQuery.trim();
		if (query === "") {
			return indexedVersions;
		}

		const matchRes = safe.try((): readonly IndexedReleaseVersion[] => {
			const miniSearch = new MiniSearch<VersionMiniSearchDoc>({
				fields: ["version", "text", "domain", "description"],
				storeFields: ["id", "domainWeight"],
				idField: "id",
			});

			const docs: VersionMiniSearchDoc[] = indexedVersions.map(
				(v: IndexedReleaseVersion, idx: number): VersionMiniSearchDoc => {
					return {
						id: String(idx),
						version: v.version,
						text: v.badgeInfo.text,
						domain: v.badgeInfo.domain,
						description: v.badgeInfo.description,
						domainWeight: v.domainWeight,
					};
				},
			);

			miniSearch.addAll(docs);

			const results = miniSearch.search(query, {
				prefix: true,
				fuzzy: getFuzzyOption(enableFuzzy),
				boost: { version: 4, text: 3, domain: 2, description: 1 },
				combineWith: "AND",
			});

			const scoredResults = results.map(
				(res): { item: IndexedReleaseVersion; weightedScore: number } => {
					const resRecord = res as unknown as { readonly id: unknown };
					const resIdStr = String(resRecord.id);
					const idx = Number(resIdStr);
					const item = indexedVersions[idx];
					if (item === undefined) {
						throw new Error(`Invalid version index reference: ${resIdStr}`);
					}
					const weightedScore = res.score * (1 + item.domainWeight / 100);
					return { item, weightedScore };
				},
			);

			scoredResults.sort((a, b): number => {
				return b.weightedScore - a.weightedScore;
			});

			return scoredResults.map((s): IndexedReleaseVersion => {
				return s.item;
			});
		});

		return safe.unwrapOr(matchRes, []);
	}, [indexedVersions, deferredQuery, enableFuzzy]);

	const showLatest = useMemo((): boolean => {
		const query = deferredQuery.trim();
		if (query === "") {
			return true;
		}

		const matchRes = safe.try((): boolean => {
			const miniSearch = new MiniSearch<{ id: string; text: string }>({
				fields: ["text"],
				storeFields: ["id"],
				idField: "id",
			});

			miniSearch.addAll([
				{ id: "latest", text: "latest" },
				{ id: "version", text: "Latest version" },
			]);

			const results = miniSearch.search(query, {
				prefix: true,
				fuzzy: getFuzzyOption(enableFuzzy),
				combineWith: "AND",
			});

			return results.length > 0;
		});

		return safe.unwrapOr(matchRes, false);
	}, [deferredQuery, enableFuzzy]);

	const effectiveListData = useMemo((): readonly IndexedReleaseVersion[] => {
		const items: IndexedReleaseVersion[] = [];

		if (showLatest) {
			items.push(INDEXED_LATEST_ITEM);
		}

		items.push(...filteredIndexedVersions);

		if (isErrorCombined) {
			items.push(INDEXED_ERROR_RETRY_ITEM);
		} else if (hasMore) {
			items.push(INDEXED_LOAD_MORE_ITEM);
		}

		return items;
	}, [showLatest, filteredIndexedVersions, isErrorCombined, hasMore]);

	const {
		activeIndex,
		activeValue,
		listHeight,
		handleItemMouseEnter,
		handleKeyDown,
		setActiveIndex,
		resetSearch,
	} = useModalListSearch({
		items: effectiveListData,
		getItemId: GET_ITEM_ID,
		virtuosoRef,
		itemHeight: 56,
		maxHeight: 320,
		pageJump: 10,
		searchQuery,
		setSearchQuery,
		onSelect: (item: IndexedReleaseVersion): void => {
			handleSelect(item.version);
		},
		onClose: closeModal,
	});

	const displayValue = useMemo((): string => {
		if (value === "latest") {
			return "Latest version";
		}
		if (value !== "") {
			return value;
		}
		return "Select a version...";
	}, [value]);

	const openModal = useCallback((): void => {
		runTransition((): void => {
			setFetchErrorState(null);
			resetSearch();
			setIsOpen(true);
		});
	}, [resetSearch, setIsOpen, runTransition]);

	const activeErrorMessage = useMemo((): string | null => {
		if (fetchErrorState !== null) {
			return fetchErrorState;
		}
		if (infiniteError !== null) {
			return infiniteError.message;
		}
		return null;
	}, [fetchErrorState, infiniteError]);

	return {
		state: {
			isOpen: isOpenValue,
			searchQuery,
			deferredQuery,
			filteredVersions: filteredIndexedVersions,
			displayValue,
			showLatest,
			listData: effectiveListData,
			listHeight,
			activeIndex,
			activeValue,
			isLoadingMore: isFetchingNextPage || isManualLoadingMore,
			hasMore,
			isError: isErrorCombined,
			errorMessage: activeErrorMessage,
		},
		actions: {
			setIsOpen,
			openModal,
			closeModal,
			setSearchQuery,
			handleSelect,
			handleItemMouseEnter,
			handleKeyDown,
			setActiveIndex,
			handleLoadMore,
			handleRetry,
		},
	};
}
