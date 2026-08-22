import { IDENTIFIER_REGEXP } from "@/domain/schemas";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Api } from "@/utils/safe";
import type { OperationContext } from "@/domain/types";

export interface ParsedRepository {
	readonly owner: string;
	readonly repo: string;
}

export interface ValidatedRepository {
	readonly isValid: boolean;
	readonly scrubbed: string;
}

export const resolveApiContext = (
	ctx?: OperationContext | Api | AbortSignal,
): Api | AbortSignal | undefined => {
	if (ctx !== undefined && "safeCtx" in ctx) {
		return ctx.safeCtx;
	}
	return ctx;
};

export const resolveToken = (
	token?: string,
	ctx?: OperationContext | Api | AbortSignal,
): string => {
	if (typeof token === "string" && token !== "") {
		return token;
	}
	if (ctx !== undefined && "token" in ctx && typeof ctx.token === "string") {
		return ctx.token;
	}
	return "";
};

export const parseRepositoryPath = (repository: string): ParsedRepository | null => {
	const scrubbed = scrubRepositoryUrl(repository);
	const splitIndex = scrubbed.indexOf("/");

	if (splitIndex <= 0 || splitIndex === scrubbed.length - 1) {
		return null;
	}

	return {
		owner: scrubbed.substring(0, splitIndex),
		repo: scrubbed.substring(splitIndex + 1),
	};
};

export const validateRepositoryIdentifier = (repository: string): ValidatedRepository => {
	const scrubbed = scrubRepositoryUrl(repository);
	const isValid = scrubbed !== "" && IDENTIFIER_REGEXP.test(scrubbed);
	return { isValid, scrubbed };
};

export const createAbortListener = (
	signal: AbortSignal | undefined,
	onAbort: (reason: unknown) => void,
): (() => void) => {
	if (signal === undefined) {
		return (): void => {};
	}

	const handler = (): void => {
		const { reason } = signal as Readonly<{ reason: unknown }>;
		onAbort(reason instanceof Error ? reason : new Error("Operation aborted"));
	};

	signal.addEventListener("abort", handler, { once: true });
	return (): void => {
		signal.removeEventListener("abort", handler);
	};
};
