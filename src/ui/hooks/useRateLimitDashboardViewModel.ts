import { useMemo, useCallback, useRef } from "react";

import { useRateLimit } from "@/ui/hooks/useGitHub";
import { useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useRateLimitMetrics, type RateLimitMetrics } from "@/ui/hooks/useRateLimitMetrics";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { resolveToken } from "@/utils/secretUtils";
import { useService } from "@/ui/hooks/useService";
import { safe } from "@/utils/safe";

import type { RateLimitData } from "@/domain/types";

export interface RateLimitDashboardViewState {
	readonly metrics: RateLimitMetrics | null;
	readonly rateLimit: RateLimitData | undefined;
	readonly isAnonymous: boolean;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly isBusy: boolean;
	readonly error: Error | null;
}

export interface RateLimitDashboardViewActions {
	readonly handleManualRefresh: () => void;
}

export interface RateLimitDashboardViewModel {
	readonly state: RateLimitDashboardViewState;
	readonly actions: RateLimitDashboardViewActions;
}

export function useRateLimitDashboardViewModel(tokenSecretId?: string): RateLimitDashboardViewModel {
	const mainPlugin = useService("plugin");
	const { app } = mainPlugin;
	const { isPending, runTransition } = useTransitionAction();
	const isRefreshingRef = useRef<boolean>(false);

	const secretKey = typeof tokenSecretId === "string" && tokenSecretId.trim() !== "" ? tokenSecretId.trim() : "";
	const tokenString = useMemo((): string => {
		return resolveToken(app, secretKey);
	}, [app, secretKey]);

	const storeData = useCanaryState((state): RateLimitData | undefined => {
		const candidates: RateLimitData[] = [];
		if (secretKey !== "") {
			const entry = state.runtime.rateLimitCache[secretKey];
			if (entry !== undefined) {
				candidates.push(entry);
			}
		}
		if (tokenString !== "") {
			const entry = state.runtime.rateLimitCache[tokenString];
			if (entry !== undefined) {
				candidates.push(entry);
			}
		}
		if (secretKey === "" && tokenString === "") {
			const entry = state.runtime.rateLimitCache["anonymous"];
			if (entry !== undefined) {
				candidates.push(entry);
			}
		}
		if (candidates.length === 0) {
			return undefined;
		}
		if (candidates.length === 1) {
			return candidates[0];
		}
		candidates.sort((a, b): number => {
			return b.timestamp - a.timestamp;
		});
		return candidates[0];
	});

	const {
		data: queryData,
		isLoading,
		isError,
		isFetching,
		error,
		refetch,
	} = useRateLimit(tokenSecretId);

	const rateLimit = useMemo((): RateLimitData | undefined => {
		if (storeData === undefined) {
			return queryData;
		}
		if (queryData === undefined) {
			return storeData;
		}
		return storeData.timestamp >= queryData.timestamp ? storeData : queryData;
	}, [storeData, queryData]);

	const metrics = useRateLimitMetrics(rateLimit);
	const isAnonymous = tokenString === "";
	const isBusy = isFetching || isPending;

	let normalizedError: Error | null = null;
	if (error instanceof Error) {
		normalizedError = error;
	} else if (error !== null) {
		normalizedError = new Error(String(error));
	}

	const handleManualRefresh = useCallback((): void => {
		if (isRefreshingRef.current === true || isFetching === true || isPending === true) {
			return;
		}
		isRefreshingRef.current = true;
		runTransition(async (): Promise<void> => {
			const res = await safe.tryAsync((): Promise<unknown> => {
				return refetch();
			});
			isRefreshingRef.current = false;
			if (res.ok === false) {
				console.error("[useRateLimitDashboardViewModel] Failed to refresh rate limit:", res.error);
			}
		});
	}, [isFetching, isPending, refetch, runTransition]);

	return {
		state: {
			metrics,
			rateLimit,
			isAnonymous,
			isLoading,
			isError,
			isBusy,
			error: normalizedError,
		},
		actions: {
			handleManualRefresh,
		},
	};
}
