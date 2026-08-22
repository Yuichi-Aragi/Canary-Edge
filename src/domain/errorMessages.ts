import { match, P } from "ts-pattern";

export const ERROR_MESSAGES = {
	OFFLINE: "You appear to be offline. Please check your internet connection.",
	rateLimit: (minutes: number): string => {
		return `GitHub API rate limit exceeded. Please try again in ${String(minutes)} minutes or add a Personal Access Token in settings.`;
	},
	NOT_FOUND: "The repository could not be found. It may be private (requiring a token), deleted, or the URL is incorrect.",
	UNAUTHORIZED: "Authentication failed. Your Personal Access Token may be invalid, expired, or missing required scopes.",
	FORBIDDEN: "Access forbidden. This is often due to rate limiting or lack of permissions for this repository.",
	SERVER_ERROR: "GitHub is experiencing internal errors. Please try again later.",
	TIMEOUT: "The connection to GitHub timed out. Please check your network connection.",
	DNS_ERROR: "Could not resolve GitHub address. Please check your DNS settings or internet connection.",
	GENERIC: "An unexpected error occurred while communicating with GitHub.",
	MANIFEST_MISSING: "This repository does not appear to be an Obsidian plugin (manifest.json missing).",
	MANIFEST_INVALID: "The plugin's manifest.json file is invalid or malformed.",
	NO_RELEASES: "This repository has no releases. Canary Edge requires a GitHub Release to install the plugin.",
	MAIN_JS_MISSING: "The release is incomplete (main.js missing).",
} as const;

function calculateMinutesToReset(resetSeconds: number): number {
	const currentSeconds = Math.floor(Date.now() / 1000);
	const minutes = Math.ceil((resetSeconds - currentSeconds) / 60);
	return minutes > 0 ? minutes : 1;
}

class GHRateLimitError extends Error {
	public constructor(
		public readonly limit: number,
		public readonly remaining: number,
		public readonly reset: number,
		public readonly requestUrl: string,
	) {
		const minutesToReset = calculateMinutesToReset(reset);
		super(`GitHub API rate limit exceeded. Reset in ${String(minutesToReset)} minutes.`);
		this.name = "GHRateLimitError";
	}

	public getMinutesToReset(): number {
		return calculateMinutesToReset(this.reset);
	}
}

export class NetworkError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "NetworkError";
	}
}

const OctokitErrorPattern = {
	status: P.number,
	message: P.string,
	headers: P.optional(P.record(P.string, P.union(P.string, P.number, P.nullish))),
};

export function getFriendlyErrorMessage(error: unknown, context?: string): string {
	const message = match(error)
		.with(P.instanceOf(NetworkError), (e): string => {
			return e.message;
		})
		.with(P.instanceOf(GHRateLimitError), (e): string => {
			return ERROR_MESSAGES.rateLimit(e.getMinutesToReset());
		})
		.with(OctokitErrorPattern, (octError): string => {
			return match(octError.status)
				.with(401, (): string => {
					return ERROR_MESSAGES.UNAUTHORIZED;
				})
				.with(404, (): string => {
					return ERROR_MESSAGES.NOT_FOUND;
				})
				.with(P.union(500, 502, 503, 504), (): string => {
					return ERROR_MESSAGES.SERVER_ERROR;
				})
				.with(P.union(403, 429), (): string => {
					const { headers } = octError;
					if (headers !== undefined) {
						const remaining = headers["x-ratelimit-remaining"];
						if (remaining === "0" || octError.status === 429) {
							const resetTime = headers["x-ratelimit-reset"];
							if (resetTime !== undefined && resetTime !== null) {
								const resetSeconds = Number(resetTime);
								if (!Number.isNaN(resetSeconds)) {
									return ERROR_MESSAGES.rateLimit(calculateMinutesToReset(resetSeconds));
								}
							}
						}
					}
					return ERROR_MESSAGES.FORBIDDEN;
				})
				.otherwise((): string => {
					return `GitHub Error (${String(octError.status)}): ${octError.message}`;
				});
		})
		.with(P.instanceOf(Error), (e): string => {
			const msg = e.message.toLowerCase();
			return match(msg)
				.when(
					(m): boolean => {
						return m.includes("timeout");
					},
					(): string => {
						return ERROR_MESSAGES.TIMEOUT;
					},
				)
				.when(
					(m): boolean => {
						return m.includes("offline") || m.includes("internet");
					},
					(): string => {
						return ERROR_MESSAGES.OFFLINE;
					},
				)
				.when(
					(m): boolean => {
						return m.includes("addrnotavail") || m.includes("eai_again");
					},
					(): string => {
						return ERROR_MESSAGES.DNS_ERROR;
					},
				)
				.otherwise((): string => {
					return e.message;
				});
		})
		.with(P.string, (s): string => {
			return s;
		})
		.otherwise((): string => {
			return ERROR_MESSAGES.GENERIC;
		});

	if (typeof context === "string" && context !== "") {
		return `${context} ${message}`;
	}
	return message;
}
