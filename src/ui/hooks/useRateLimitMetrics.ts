import { useMemo } from "react";
import { clamp } from "es-toolkit";
import { format } from "date-fns";

import { safe } from "@/utils/safe";

import type { RateLimitData } from "@/domain/types";

export interface RateLimitMetrics {
	readonly percentRemaining: number;
	readonly severity: "critical" | "warning" | "safe";
	readonly healthText: string;
	readonly resetTimeStr: string;
	readonly updateTimeStr: string;
	readonly safeLimit: number;
}

export function useRateLimitMetrics(rateLimit: RateLimitData | undefined): RateLimitMetrics | null {
	return useMemo((): RateLimitMetrics | null => {
		if (rateLimit === undefined) {
			return null;
		}

		const metricsResult = safe.try((): RateLimitMetrics => {
			const safeLimit = rateLimit.limit > 0 ? rateLimit.limit : 1;
			const percentRemaining = clamp((rateLimit.remaining / safeLimit) * 100, 0, 100);

			let severity: "critical" | "warning" | "safe" = "safe";
			if (percentRemaining < 20) {
				severity = "critical";
			} else if (percentRemaining < 50) {
				severity = "warning";
			}

			let healthText = "Healthy";
			if (percentRemaining === 0) {
				healthText = "Exhausted";
			} else if (percentRemaining < 20) {
				healthText = "Dangerously Low";
			} else if (percentRemaining < 50) {
				healthText = "Depleting";
			}

			const resetTimeStr = format(new Date(rateLimit.reset * 1000), "HH:mm");
			const updateTimeStr = format(new Date(rateLimit.timestamp), "HH:mm:ss");

			return {
				percentRemaining,
				severity,
				healthText,
				resetTimeStr,
				updateTimeStr,
				safeLimit,
			};
		});

		return safe.unwrapOr(metricsResult, null);
	}, [rateLimit]);
}
