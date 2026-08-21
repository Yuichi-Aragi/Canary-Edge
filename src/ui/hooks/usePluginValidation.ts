import { useCallback, useMemo, useRef, useState } from "react";
import { match } from "ts-pattern";

import { getFriendlyErrorMessage } from "@/domain/errorMessages";
import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useBoolean } from "@/ui/hooks/useBoolean";
import { useReleaseVersions, useValidateToken } from "@/ui/hooks/useGitHub";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { assertInternetConnection } from "@/utils/internetconnection";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { QueryObserverResult } from "@tanstack/react-query";
import type { UseFormSetValue, UseFormTrigger } from "react-hook-form";
import type { InstallPluginFormData } from "@/domain/schemas";
import type { GitHubTokenInfo, ReleaseVersion } from "@/domain/types";

export type ValidationStatus =
	| "idle_empty"
	| "idle_unvalidated"
	| "validating_repo"
	| "validating_token"
	| "success"
	| "error";

export interface UsePluginValidationProps {
	readonly watchedRepo: string;
	readonly watchedUseToken: boolean;
	readonly watchedTokenId?: string | undefined;
	readonly prefillRepo?: string | undefined;
	readonly trigger: UseFormTrigger<InstallPluginFormData>;
	readonly setValue: UseFormSetValue<InstallPluginFormData>;
}

export interface UsePluginValidationResult {
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly tokenInfo: GitHubTokenInfo | null | undefined;
	readonly shouldValidateRepo: boolean;
	readonly isLoadingVersions: boolean;
	readonly isVersionsSuccess: boolean;
	readonly isVersionsError: boolean;
	readonly isValidatingToken: boolean;
	readonly isTokenChecked: boolean;
	readonly isValidationPending: boolean;
	readonly validationStatus: ValidationStatus;
	readonly validationMessage: string;
	readonly validatedRepo: string;
	readonly handleRepoValidation: (overrideValue?: string) => Promise<boolean>;
	readonly handleTokenValidation: () => Promise<boolean>;
	readonly resetRepoValidation: () => void;
	readonly resetAllValidation: () => void;
}

interface ValidationTarget {
	readonly repo: string;
	readonly tokenSecretId?: string | undefined;
	readonly sessionId: number;
}

export function usePluginValidation({
	watchedRepo,
	watchedUseToken,
	watchedTokenId,
	prefillRepo,
	trigger,
	setValue,
}: Readonly<UsePluginValidationProps>): UsePluginValidationResult {
	const initialHasPrefill = typeof prefillRepo === "string" && prefillRepo.trim() !== "";
	const initialScrubbedPrefill = initialHasPrefill ? scrubRepositoryUrl(prefillRepo) : "";

	const sessionCounterRef = useRef<number>(initialHasPrefill ? 1 : 0);

	const [validationTarget, setValidationTarget] = useState<ValidationTarget | null>((): ValidationTarget | null => {
		if (initialHasPrefill === true && initialScrubbedPrefill !== "") {
			return {
				repo: initialScrubbedPrefill,
				tokenSecretId: watchedUseToken ? watchedTokenId : undefined,
				sessionId: 1,
			};
		}
		return null;
	});

	const [
		shouldValidateToken,
		{ setTrue: enableTokenValidation, setFalse: disableTokenValidation },
	] = useBoolean(false);

	const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);

	const shouldValidateRepo = validationTarget !== null && validationTarget.repo !== "";
	const effectiveValidatedRepo = validationTarget?.repo ?? "";
	const effectiveTokenSecretId = watchedUseToken ? (watchedTokenId ?? "") : undefined;

	const {
		data: versions,
		isLoading: isLoadingVersions,
		isError: isVersionsError,
		error: versionsError,
		isSuccess: isVersionsSuccess,
		refetch: refetchVersions,
	} = useReleaseVersions(
		effectiveValidatedRepo,
		effectiveTokenSecretId,
		shouldValidateRepo,
	);

	const {
		data: tokenInfo,
		isLoading: isValidatingToken,
		isSuccess: isTokenChecked,
		refetch: refetchToken,
	} = useValidateToken(watchedTokenId ?? "", shouldValidateToken);

	const { isPending: isTransitionPending, runTransition } = useTransitionAction();

	const resetRepoValidation = useCallback((): void => {
		sessionCounterRef.current += 1;
		setValidationTarget(null);
		setLastErrorMessage(null);
		setValue("version", "");
	}, [setValue]);

	const resetAllValidation = useCallback((): void => {
		sessionCounterRef.current += 1;
		setValidationTarget(null);
		setLastErrorMessage(null);
		disableTokenValidation();
		setValue("version", "");
	}, [disableTokenValidation, setValue]);

	const handleRepoValidation = useCallback(
		async (overrideValue?: string): Promise<boolean> => {
			const rawInput = overrideValue ?? watchedRepo;
			const trimmedInput = rawInput.trim();

			if (trimmedInput === "") {
				resetRepoValidation();
				return false;
			}

			const currentSessionId = sessionCounterRef.current + 1;
			sessionCounterRef.current = currentSessionId;
			setLastErrorMessage(null);

			const onlineRes = await safe.tryAsync(async (): Promise<void> => {
				await assertInternetConnection();
			});

			if (onlineRes.ok === false) {
				const offlineMsg = getFriendlyErrorMessage(onlineRes.error);
				setLastErrorMessage(offlineMsg);
				canaryToast.error(offlineMsg);
				return false;
			}

			const scrubbed = scrubRepositoryUrl(trimmedInput);
			setValue("repositoryUrl", scrubbed, { shouldValidate: true });

			const formatValidationResult = await safe.tryAsync(async (): Promise<boolean> => {
				return await trigger("repositoryUrl");
			});

			const isFormatValid = safe.unwrapOr(formatValidationResult, false);
			if (isFormatValid === false) {
				return false;
			}

			if (sessionCounterRef.current !== currentSessionId) {
				return false;
			}

			let validationSucceeded = false;

			await new Promise<void>((resolve): void => {
				runTransition(async (): Promise<void> => {
					setValidationTarget({
						repo: scrubbed,
						tokenSecretId: watchedUseToken ? watchedTokenId : undefined,
						sessionId: currentSessionId,
					});

					const queryResult = await safe.tryAsync(
						async (): Promise<QueryObserverResult<ReleaseVersion[]>> => {
							return await refetchVersions();
						},
					);

					if (sessionCounterRef.current !== currentSessionId) {
						resolve();
						return;
					}

					if (queryResult.ok === false) {
						const friendlyMsg = getFriendlyErrorMessage(queryResult.error);
						setLastErrorMessage(friendlyMsg);
						canaryToast.error(friendlyMsg);
						validationSucceeded = false;
					} else if (queryResult.value.isSuccess === true) {
						setLastErrorMessage(null);
						canaryToast.success(`Repository validated: ${scrubbed}`);
						validationSucceeded = true;
					} else if (queryResult.value.isError === true) {
						const friendlyMsg = getFriendlyErrorMessage(queryResult.value.error);
						setLastErrorMessage(friendlyMsg);
						canaryToast.error(friendlyMsg);
						validationSucceeded = false;
					}

					resolve();
				});
			});

			return validationSucceeded;
		},
		[
			watchedRepo,
			watchedUseToken,
			watchedTokenId,
			trigger,
			setValue,
			resetRepoValidation,
			refetchVersions,
			runTransition,
		],
	);

	const handleTokenValidation = useCallback(async (): Promise<boolean> => {
		if (watchedTokenId === undefined || watchedTokenId.trim() === "") {
			return false;
		}

		const currentSessionId = sessionCounterRef.current;

		const onlineRes = await safe.tryAsync(async (): Promise<void> => {
			await assertInternetConnection();
		});

		if (onlineRes.ok === false) {
			const offlineMsg = getFriendlyErrorMessage(onlineRes.error);
			canaryToast.error(offlineMsg);
			return false;
		}

		let tokenValid = false;

		await new Promise<void>((resolve): void => {
			runTransition(async (): Promise<void> => {
				enableTokenValidation();
				const result = await safe.tryAsync(
					async (): Promise<QueryObserverResult<GitHubTokenInfo | null>> => {
						return await refetchToken();
					},
				);

				if (sessionCounterRef.current !== currentSessionId) {
					resolve();
					return;
				}

				if (result.ok === false) {
					canaryToast.error("Token validation failed due to network or internal error.");
					tokenValid = false;
				} else if (result.value.isSuccess === true && result.value.data?.validToken === true) {
					canaryToast.success("Token validated successfully.");
					tokenValid = true;
				} else {
					canaryToast.error("Token validation failed.");
					tokenValid = false;
				}

				resolve();
			});
		});

		return tokenValid;
	}, [watchedTokenId, enableTokenValidation, refetchToken, runTransition]);

	const isValidationPending = isTransitionPending || isLoadingVersions || isValidatingToken;

	const validationStatus: ValidationStatus = useMemo((): ValidationStatus => {
		if (watchedRepo.trim() === "") {
			return "idle_empty";
		}
		if (shouldValidateRepo === false) {
			return "idle_unvalidated";
		}
		if (isLoadingVersions === true) {
			return "validating_repo";
		}
		if (isValidatingToken === true) {
			return "validating_token";
		}
		if (isVersionsError === true || lastErrorMessage !== null) {
			return "error";
		}
		if (isVersionsSuccess === true) {
			return "success";
		}
		return "idle_unvalidated";
	}, [
		watchedRepo,
		shouldValidateRepo,
		isLoadingVersions,
		isValidatingToken,
		isVersionsError,
		lastErrorMessage,
		isVersionsSuccess,
	]);

	const validationMessage: string = useMemo((): string => {
		return match(validationStatus)
			.with("idle_empty", (): string => "Enter a GitHub repository address.")
			.with("idle_unvalidated", (): string => "Press Enter to validate repository.")
			.with("validating_repo", (): string => "Validating repository with GitHub...")
			.with("validating_token", (): string => "Verifying authentication credentials...")
			.with("error", (): string => {
				if (lastErrorMessage !== null) {
					return lastErrorMessage;
				}
				if (versionsError !== null && versionsError !== undefined) {
					return getFriendlyErrorMessage(versionsError);
				}
				return "Validation failed. Check repository name and token permissions.";
			})
			.with("success", (): string => {
				const releaseCount = versions?.length ?? 0;
				const releaseSuffix = releaseCount === 1 ? "release" : "releases";
				return `Repository verified: ${effectiveValidatedRepo} (${String(releaseCount)} ${releaseSuffix} found)`;
			})
			.exhaustive();
	}, [validationStatus, lastErrorMessage, versionsError, versions, effectiveValidatedRepo]);

	return {
		versions,
		tokenInfo,
		shouldValidateRepo,
		isLoadingVersions,
		isVersionsSuccess,
		isVersionsError,
		isValidatingToken,
		isTokenChecked,
		isValidationPending,
		validationStatus,
		validationMessage,
		validatedRepo: effectiveValidatedRepo,
		handleRepoValidation,
		handleTokenValidation,
		resetRepoValidation,
		resetAllValidation,
	};
}
