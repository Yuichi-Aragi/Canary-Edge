import { requestUrl } from "obsidian";

import { ERROR_MESSAGES, NetworkError } from "@/domain/errorMessages";
import { safe } from "@/utils/safe";

import type { RequestUrlResponse } from "obsidian";

const CONNECTIVITY_PROBE_URL = "https://captive.apple.com/hotspot-detect.html" as const;
const PROBE_TIMEOUT_MS = 3000 as const;
const ONLINE_CACHE_TTL_MS = 5000 as const;
const OFFLINE_CACHE_TTL_MS = 1500 as const;
const HTTP_STATUS_OK_MIN = 200 as const;
const HTTP_STATUS_REDIRECT_MAX = 400 as const;

interface ConnectivityCacheEntry {
	readonly isOnline: boolean;
	readonly timestamp: number;
}

let cachedConnectivity: ConnectivityCacheEntry | null = null;
let activeProbePromise: Promise<boolean> | null = null;

async function executeProbe(): Promise<boolean> {
	if (!navigator.onLine) {
		return false;
	}

	const cacheBuster = `${String(Date.now())}-${String(Math.random())}`;
	const probeUrl = `${CONNECTIVITY_PROBE_URL}?_=${cacheBuster}`;

	let timeoutId: number | undefined;
	const timeoutPromise = new Promise<never>((_, reject): void => {
		timeoutId = window.setTimeout((): void => {
			reject(new NetworkError(ERROR_MESSAGES.TIMEOUT));
		}, PROBE_TIMEOUT_MS);
	});

	const requestPromise = requestUrl({
		url: probeUrl,
		method: "GET",
		throw: false,
		headers: {
			"Cache-Control": "no-cache, no-store, must-revalidate",
			Pragma: "no-cache",
		},
	});

	const onlineRes = await safe.tryAsync(async (): Promise<RequestUrlResponse> => {
		try {
			return await Promise.race([requestPromise, timeoutPromise]);
		} finally {
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}
		}
	});

	if (!onlineRes.ok) {
		return false;
	}

	const statusCode = onlineRes.value.status;
	return statusCode >= HTTP_STATUS_OK_MIN && statusCode < HTTP_STATUS_REDIRECT_MAX;
}

export async function isConnectedToInternet(forceCheck = false): Promise<boolean> {
	if (!navigator.onLine) {
		cachedConnectivity = { isOnline: false, timestamp: Date.now() };
		return false;
	}

	const now = Date.now();
	if (!forceCheck && cachedConnectivity !== null) {
		const ttl = cachedConnectivity.isOnline ? ONLINE_CACHE_TTL_MS : OFFLINE_CACHE_TTL_MS;
		if (now - cachedConnectivity.timestamp < ttl) {
			return cachedConnectivity.isOnline;
		}
	}

	if (activeProbePromise !== null) {
		try {
			return await activeProbePromise;
		} catch (error: unknown) {
			console.error("[Connectivity] Probe resolution failed:", error);
			return false;
		}
	}

	activeProbePromise = (async (): Promise<boolean> => {
		try {
			const isOnline = await executeProbe();
			cachedConnectivity = { isOnline, timestamp: Date.now() };
			return isOnline;
		} finally {
			activeProbePromise = null;
		}
	})();

	try {
		return await activeProbePromise;
	} catch (error: unknown) {
		console.error("[Connectivity] Probe resolution failed:", error);
		return false;
	}
}

export async function assertInternetConnection(forceCheck = false): Promise<void> {
	const online = await isConnectedToInternet(forceCheck);
	if (!online) {
		throw new NetworkError(ERROR_MESSAGES.OFFLINE);
	}
}
