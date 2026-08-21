import { valibotResolver } from "@hookform/resolvers/valibot";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";

import { InstallPluginFormSchema } from "@/domain/schemas";
import { createOperationContext } from "@/services/OperationContext";
import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useCanaryActions, useCanaryState } from "@/ui/hooks/useCanaryStore";
import { useCategoryTab } from "@/ui/hooks/useCategoryTab";
import { useRemoteManifest } from "@/ui/hooks/useGitHub";
import { usePluginId } from "@/ui/hooks/usePluginId";
import { usePluginOperations } from "@/ui/hooks/usePluginOperations";
import { usePluginValidation } from "@/ui/hooks/usePluginValidation";
import { useService } from "@/ui/hooks/useService";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { safe } from "@/utils/safe";
import { getAvailableSecrets } from "@/utils/secretUtils";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Resolver, SubmitHandler, UseFormReturn } from "react-hook-form";
import type { InstallPluginFormData } from "@/domain/schemas";
import type {
	GitHubTokenInfo,
	OperationState,
	ReleaseChannel,
	ReleaseVersion,
	ShowChangelogConfig,
	UpdateCheckOnLoadConfig,
	UpdateIntervalConfig,
} from "@/domain/types";
import type { ValidationStatus } from "@/ui/hooks/usePluginValidation";

type InstallPluginSettingCategory =
	| "General"
	| "Update Rules"
	| "Automation"
	| "Version & Auth"
	| "README";

interface PreviewPluginData {
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly author: string;
	readonly isIncompatible: boolean;
}

export interface InstallPluginViewState {
	readonly form: UseFormReturn<InstallPluginFormData>;
	readonly watchedRepo: string;
	readonly watchedUseToken: boolean;
	readonly watchedTokenId: string | undefined;
	readonly watchedVersion: string;
	readonly watchedShowChangelog: ShowChangelogConfig;
	readonly watchedReleaseChannel: ReleaseChannel;
	readonly watchedUpdateInterval: UpdateIntervalConfig;
	readonly watchedUpdateCheckOnLoad: UpdateCheckOnLoadConfig;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly tokenInfo: GitHubTokenInfo | null | undefined;
	readonly shouldValidateRepo: boolean;
	readonly isLoadingVersions: boolean;
	readonly isVersionsSuccess: boolean;
	readonly isVersionsError: boolean;
	readonly isValidatingToken: boolean;
	readonly isTokenChecked: boolean;
	readonly isPending: boolean;
	readonly isSubmitting: boolean;
	readonly previewPlugin: PreviewPluginData | null;
	readonly previewVersion: string;
	readonly isPreviewLoading: boolean;
	readonly isPreviewError: boolean;
	readonly previewErrorMessage: string | undefined;
	readonly shouldShowPreviewCard: boolean;
	readonly existingOperation: OperationState | undefined;
	readonly isConflict: boolean;
	readonly isAlreadyTracked: boolean;
	readonly isValidated: boolean;
	readonly validationStatus: ValidationStatus;
	readonly validationMessage: string;
	readonly secretOptions: readonly string[];
	readonly activeCategory: InstallPluginSettingCategory;
	readonly categories: readonly InstallPluginSettingCategory[];
}

export interface InstallPluginViewActions {
	readonly handleRepoValidation: (overrideValue?: string) => Promise<boolean>;
	readonly handleTokenValidation: () => Promise<boolean>;
	readonly handleRepoChange: (value: string) => void;
	readonly handleRepoKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	readonly onSubmit: SubmitHandler<InstallPluginFormData>;
	readonly setActiveCategory: (cat: InstallPluginSettingCategory) => void;
	readonly handleRetryPreview: () => void;
}

export interface InstallPluginViewModel {
	readonly state: InstallPluginViewState;
	readonly actions: InstallPluginViewActions;
}

export interface UseInstallPluginViewModelOptions {
	readonly prefillRepo?: string | undefined;
	readonly prefillVersion?: string | undefined;
	readonly prefillReleaseChannel?: ReleaseChannel | undefined;
	readonly onSuccess?: (() => void) | undefined;
	readonly closeModal: () => void;
}

const INSTALL_PLUGIN_CATEGORIES: readonly InstallPluginSettingCategory[] = [
	"General",
	"Update Rules",
	"Automation",
	"Version & Auth",
	"README",
] as const;

export function useInstallPluginViewModel(
	options: Readonly<UseInstallPluginViewModelOptions>,
): InstallPluginViewModel {
	const { prefillRepo, prefillVersion, prefillReleaseChannel, onSuccess, closeModal } = options;

	const mainPlugin = useService("plugin");
	const settingsService = useService("settingsService");
	const compatibilityService = useService("pluginCompatibilityService");

	const settings = useCanaryState((state) => state.settings);
	const operations = useCanaryState((state) => state.runtime.operations);
	const setActiveDashboardFilters = useCanaryActions((actions) => actions.setActiveDashboardFilters);

	const { isPending: isSubmitting, runTransition } = useTransitionAction();
	const { installPlugin } = usePluginOperations();

	const secretOptions = useMemo((): readonly string[] => {
		return getAvailableSecrets(mainPlugin.app);
	}, [mainPlugin.app]);

	const globalSettings = safe.unwrap(settingsService.getSettings()).global;

	const defaultFormValues = useMemo((): InstallPluginFormData => {
		return {
			repositoryUrl: prefillRepo ?? "",
			version: prefillVersion ?? "",
			usePrivateApiKey: false,
			privateApiKeySecretId: "",
			autoEnable: globalSettings.autoEnable,
			showChangelog: {
				mode: globalSettings.showChangelog.mode,
				priority: globalSettings.showChangelog.priority,
			},
			updateCheckOnLoad: globalSettings.updateCheckOnLoad,
			status: "active",
			updateInterval: globalSettings.updateInterval,
			releaseChannel: prefillReleaseChannel ?? globalSettings.releaseChannel,
			forceInstall: globalSettings.forceInstall,
		};
	}, [prefillRepo, prefillVersion, prefillReleaseChannel, globalSettings]);

	const form = useForm<InstallPluginFormData>({
		resolver: valibotResolver(InstallPluginFormSchema) as unknown as Resolver<InstallPluginFormData>,
		defaultValues: defaultFormValues,
		mode: "onChange",
	});

	const { control, setValue, trigger, reset: resetForm } = form;

	const [
		watchedRepo,
		watchedUseToken,
		watchedTokenId,
		watchedVersion,
		watchedShowChangelog,
		watchedReleaseChannel,
		watchedUpdateInterval,
		watchedUpdateCheckOnLoad,
		watchedForceInstall,
	] = useWatch({
		control,
		name: [
			"repositoryUrl",
			"usePrivateApiKey",
			"privateApiKeySecretId",
			"version",
			"showChangelog",
			"releaseChannel",
			"updateInterval",
			"updateCheckOnLoad",
			"forceInstall",
		],
	});

	const validation = usePluginValidation({
		watchedRepo,
		watchedUseToken,
		watchedTokenId,
		prefillRepo,
		trigger,
		setValue,
	});

	const { activeCategory, setActiveCategory } = useCategoryTab<InstallPluginSettingCategory>("General");

	const prevSessionIdentifierRef = useRef<string>(
		`${prefillRepo ?? ""}:${prefillVersion ?? ""}:${prefillReleaseChannel ?? ""}`,
	);

	useEffect((): void => {
		const currentSessionIdentifier = `${prefillRepo ?? ""}:${prefillVersion ?? ""}:${prefillReleaseChannel ?? ""}`;
		if (prevSessionIdentifierRef.current !== currentSessionIdentifier) {
			prevSessionIdentifierRef.current = currentSessionIdentifier;
			resetForm(defaultFormValues);
			validation.resetAllValidation();
			setActiveCategory("General");

			if (typeof prefillRepo === "string" && prefillRepo.trim() !== "") {
				void validation.handleRepoValidation(prefillRepo);
			}
		}
	}, [
		prefillRepo,
		prefillVersion,
		prefillReleaseChannel,
		defaultFormValues,
		resetForm,
		validation,
		setActiveCategory,
	]);

	const scrubbedRepo = watchedRepo.trim() !== "" ? scrubRepositoryUrl(watchedRepo) : "";
	const pluginId = usePluginId(scrubbedRepo);

	const isAlreadyTracked = useMemo((): boolean => {
		if (scrubbedRepo === "" || pluginId === undefined) {
			return false;
		}
		return Object.hasOwn(settings.plugins, scrubbedRepo) === true;
	}, [scrubbedRepo, pluginId, settings.plugins]);

	useEffect((): void => {
		if (validation.isVersionsSuccess === true && isAlreadyTracked === true && scrubbedRepo !== "") {
			canaryToast.warning(
				"Plugin is already tracked. Please use the settings panel for upgrading, downgrading, and reinstalling.",
				{ id: `already-tracked-${scrubbedRepo}` },
			);
		}
	}, [validation.isVersionsSuccess, isAlreadyTracked, scrubbedRepo]);

	const existingOperation = validation.shouldValidateRepo ? operations[scrubbedRepo] : undefined;
	const isConflict = existingOperation?.status === "pending";

	const remoteManifestQuery = useRemoteManifest(
		validation.validatedRepo !== "" ? validation.validatedRepo : scrubbedRepo,
		watchedVersion !== "" ? watchedVersion : "latest",
		watchedReleaseChannel,
		watchedUseToken ? (watchedTokenId ?? "") : undefined,
		validation.shouldValidateRepo && validation.isVersionsSuccess,
	);

	const previewPlugin = useMemo((): PreviewPluginData | null => {
		if (
			validation.shouldValidateRepo === false ||
			remoteManifestQuery.data === null ||
			remoteManifestQuery.data === undefined
		) {
			return null;
		}

		const { manifest } = remoteManifestQuery.data;

		const ctx = createOperationContext({
			repo: scrubbedRepo,
			operationType: "check",
			overrides: { forceInstall: watchedForceInstall },
		});

		const appCompatRes = compatibilityService.checkAppVersionCompatibility(manifest, ctx);
		const appCompat = safe.unwrapOr(appCompatRes, { isCompatible: true, requiresOverride: false });

		const platformCompatRes = compatibilityService.checkPlatformCompatibility(manifest, ctx);
		const platformCompat = safe.unwrapOr(platformCompatRes, { isCompatible: true, requiresOverride: false });

		const isIncompatible = appCompat.isCompatible === false || platformCompat.isCompatible === false;

		return {
			name: manifest.name,
			version: manifest.version,
			description: manifest.description,
			author: manifest.author,
			isIncompatible,
		};
	}, [
		validation.shouldValidateRepo,
		remoteManifestQuery.data,
		compatibilityService,
		scrubbedRepo,
		watchedForceInstall,
	]);

	const isValidated = validation.shouldValidateRepo && validation.isVersionsSuccess;

	const isPreviewLoading =
		validation.shouldValidateRepo === true &&
		(validation.isLoadingVersions === true ||
			validation.isValidatingToken === true ||
			validation.isValidationPending === true ||
			remoteManifestQuery.isLoading === true);

	const isPreviewError =
		validation.shouldValidateRepo === true &&
		isPreviewLoading === false &&
		(validation.isVersionsError === true ||
			remoteManifestQuery.isError === true ||
			validation.validationStatus === "error" ||
			(validation.isVersionsSuccess === true && remoteManifestQuery.data === null && remoteManifestQuery.isLoading === false));

	const previewErrorMessage = useMemo((): string | undefined => {
		if (isPreviewError === false) {
			return undefined;
		}
		if (remoteManifestQuery.error instanceof Error) {
			return remoteManifestQuery.error.message;
		}
		if (validation.validationMessage.trim() !== "") {
			return validation.validationMessage;
		}
		return "Failed to fetch repository or plugin manifest.";
	}, [isPreviewError, remoteManifestQuery.error, validation.validationMessage]);

	const shouldShowPreviewCard =
		validation.shouldValidateRepo === true ||
		previewPlugin !== null ||
		isPreviewLoading === true ||
		isPreviewError === true;

	const previewVersion = useMemo((): string => {
		if (previewPlugin !== null) {
			return previewPlugin.version;
		}
		const latestTag = validation.versions?.[0]?.version ?? "latest";
		return watchedVersion !== "" && watchedVersion !== "latest" ? watchedVersion : latestTag;
	}, [previewPlugin, watchedVersion, validation.versions]);

	useEffect((): void => {
		const shouldSetLatest =
			validation.isVersionsSuccess === true &&
			validation.versions !== undefined &&
			validation.versions.length > 0 &&
			watchedVersion === "";

		if (shouldSetLatest === true) {
			setValue("version", "latest", { shouldValidate: true });
		}
	}, [validation.isVersionsSuccess, validation.versions, watchedVersion, setValue]);

	const handleRepoChange = useCallback(
		(value: string): void => {
			runTransition((): void => {
				setValue("repositoryUrl", value, { shouldValidate: false });
				if (validation.shouldValidateRepo === true) {
					validation.resetRepoValidation();
				}
			});
		},
		[setValue, validation, runTransition],
	);

	const handleRepoKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLInputElement>): void => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				void validation.handleRepoValidation();
			}
		},
		[validation],
	);

	const handleRetryPreview = useCallback((): void => {
		runTransition(async (): Promise<void> => {
			await validation.handleRepoValidation(watchedRepo);
			if (remoteManifestQuery.refetch !== undefined) {
				await remoteManifestQuery.refetch();
			}
		});
	}, [runTransition, validation, watchedRepo, remoteManifestQuery]);

	const onSubmit = useCallback(
		(data: InstallPluginFormData): void => {
			runTransition((): void => {
				const finalScrubbedRepo = scrubRepositoryUrl(data.repositoryUrl);

				if (isAlreadyTracked === true) {
					console.warn(`[InstallPlugin] Plugin already tracked: ${finalScrubbedRepo}`);
					canaryToast.warning(
						"Plugin is already tracked. Please use the settings panel for upgrading, downgrading, and reinstalling.",
						{ id: `already-tracked-${finalScrubbedRepo}` },
					);
					return;
				}

				if (isConflict === true) {
					console.warn(`[InstallPlugin] Operation already pending for: ${finalScrubbedRepo}`);
					canaryToast.warning("Operation already in progress for this repository.", {
						id: `conflict-${finalScrubbedRepo}`,
					});
					return;
				}

				const latestVersionTag = validation.versions?.[0]?.version;
				const resolvedVersion =
					data.version === "latest" && latestVersionTag !== undefined
						? latestVersionTag
						: data.version;

				installPlugin.mutate({
					repo: finalScrubbedRepo,
					version: resolvedVersion,
					isFrozen: data.status === "frozen",
					tokenSecretId: data.usePrivateApiKey ? data.privateApiKeySecretId : undefined,
					enableAfterInstall: data.autoEnable,
					forceReinstall: true,
					overrides: {
						updateCheckOnLoad: data.updateCheckOnLoad,
						showChangelog: data.showChangelog,
						releaseChannel: data.releaseChannel,
						updateInterval: data.updateInterval,
						forceInstall: data.forceInstall,
					},
				});

				setActiveDashboardFilters(["installing"]);

				if (onSuccess !== undefined) {
					onSuccess();
				}
				closeModal();
			});
		},
		[
			isAlreadyTracked,
			isConflict,
			validation.versions,
			installPlugin,
			setActiveDashboardFilters,
			onSuccess,
			closeModal,
			runTransition,
		],
	);

	const isPending =
		installPlugin.isPending ||
		isSubmitting ||
		validation.isValidationPending ||
		remoteManifestQuery.isLoading;

	return {
		state: {
			form,
			watchedRepo,
			watchedUseToken,
			watchedTokenId,
			watchedVersion,
			watchedShowChangelog,
			watchedReleaseChannel,
			watchedUpdateInterval,
			watchedUpdateCheckOnLoad,
			versions: validation.versions,
			tokenInfo: validation.tokenInfo,
			shouldValidateRepo: validation.shouldValidateRepo,
			isLoadingVersions: validation.isLoadingVersions,
			isVersionsSuccess: validation.isVersionsSuccess,
			isVersionsError: validation.isVersionsError,
			isValidatingToken: validation.isValidatingToken,
			isTokenChecked: validation.isTokenChecked,
			isSubmitting,
			isPending,
			previewPlugin,
			previewVersion,
			isPreviewLoading,
			isPreviewError,
			previewErrorMessage,
			shouldShowPreviewCard,
			existingOperation,
			isConflict,
			isAlreadyTracked,
			isValidated,
			validationStatus: validation.validationStatus,
			validationMessage: validation.validationMessage,
			secretOptions,
			activeCategory,
			categories: INSTALL_PLUGIN_CATEGORIES,
		},
		actions: {
			handleRepoValidation: validation.handleRepoValidation,
			handleTokenValidation: validation.handleTokenValidation,
			handleRepoChange,
			handleRepoKeyDown,
			onSubmit,
			setActiveCategory,
			handleRetryPreview,
		},
	};
}
