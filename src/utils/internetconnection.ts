import { requestUrl } from "obsidian";

import { ERROR_MESSAGES, NetworkError } from "@/domain/errorMessages";
import { safe } from "@/utils/safe";

import type { RequestUrlResponse } from "obsidian";

const CONNECTIVITY_PROBE_URL = "https://obsidian.md";
const PROBE_TIMEOUT_MS = 3000;
const ONLINE_CACHE_TTL_MS = 5000;
const OFFLINE_CACHE_TTL_MS = 1500;

interface ConnectivityCacheEntry {
	readonly isOnline: boolean;
	readonly timestamp: number;
}

let cachedConnectivity: ConnectivityCacheEntry | null = null;
let activeProbePromise: Promise<boolean> | null = null;

async function executeProbe(): Promise<boolean> {
	if (navigator.onLine === false) {
		return false;
	}

	const cacheBuster = `${String(Date.now())}-${String(Math.random())}`;
	const probeUrl = `${CONNECTIVITY_PROBE_URL}/?${cacheBuster}`;

	let timeoutId: number | undefined;
	const timeoutPromise = new Promise<never>((_, reject): void => {
		timeoutId = window.setTimeout((): void => {
			reject(new NetworkError(ERROR_MESSAGES.TIMEOUT));
		}, PROBE_TIMEOUT_MS);
	});

	const requestPromise = requestUrl({
		url: probeUrl,
		method: "HEAD",
		throw: false,
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

	if (onlineRes.ok === false || onlineRes.value === null || onlineRes.value === undefined) {
		return false;
	}

	const statusCode = onlineRes.value.status;
	return statusCode >= 200 && statusCode < 400;
}

export async function isConnectedToInternet(forceCheck = false): Promise<boolean> {
	if (navigator.onLine === false) {
		cachedConnectivity = { isOnline: false, timestamp: Date.now() };
		return false;
	}

	const now = Date.now();
	if (forceCheck === false && cachedConnectivity !== null) {
		const ttl = cachedConnectivity.isOnline === true ? ONLINE_CACHE_TTL_MS : OFFLINE_CACHE_TTL_MS;
		if (now - cachedConnectivity.timestamp < ttl) {
			return cachedConnectivity.isOnline;
		}
	}

	if (activeProbePromise !== null) {
		return await activeProbePromise;
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

	return await activeProbePromise;
}

export async function assertInternetConnection(forceCheck = false): Promise<void> {
	const online = await isConnectedToInternet(forceCheck);
	if (online === false) {
		throw new NetworkError(ERROR_MESSAGES.OFFLINE);
	}
}
