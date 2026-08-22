import type { AwilixContainer, asClass, asValue } from "awilix";
import type { PluginManifest } from "obsidian";

import type {
	DEFAULT_SETTINGS_VALUES,
	CommunityPlugin,
	Release,
	PluginManifestEx,
} from "@/domain/schemas";
import type { Result, Api } from "@/utils/safe";

export interface SecretStorage {
	readonly getSecret: (id: string) => string | null;
	readonly setSecret: (id: string, secret: string) => void;
	readonly listSecrets: () => string[];
	readonly loadSecrets: () => Promise<void>;
}

export interface Modules {
	readonly SettingsService: typeof import("@/services/SettingsService").SettingsService;
	readonly NotificationService: typeof import("@/services/ui/NotificationService").NotificationService;
	readonly ConcurrencyService: typeof import("@/services/ConcurrencyService").ConcurrencyService;
	readonly OperationTrackingService: typeof import("@/services/OperationTrackingService").OperationTrackingService;
	readonly PluginCompatibilityService: typeof import("@/services/PluginCompatibilityService").PluginCompatibilityService;
	readonly ManifestMutationService: typeof import("@/services/ManifestMutationService").ManifestMutationService;
	readonly RepositoryService: typeof import("@/services/RepositoryService").RepositoryService;
	readonly PluginQueryService: typeof import("@/services/PluginQueryService").PluginQueryService;
	readonly PluginAcquisitionService: typeof import("@/services/PluginAcquisitionService").PluginAcquisitionService;
	readonly PluginDeploymentService: typeof import("@/services/PluginDeploymentService").PluginDeploymentService;
	readonly PluginInstallOperation: typeof import("@/services/operations/PluginInstallOperation").PluginInstallOperation;
	readonly PluginUpdateOperation: typeof import("@/services/operations/PluginUpdateOperation").PluginUpdateOperation;
	readonly PluginRegisterOperation: typeof import("@/services/operations/PluginRegisterOperation").PluginRegisterOperation;
	readonly PluginDeleteOperation: typeof import("@/services/operations/PluginDeleteOperation").PluginDeleteOperation;
	readonly PluginSaveSettingsOperation: typeof import("@/services/operations/PluginSaveSettingsOperation").PluginSaveSettingsOperation;
	readonly WorkflowNotificationPresenter: typeof import("@/services/operations/WorkflowNotificationPresenter").WorkflowNotificationPresenter;
	readonly PluginWorkflowService: typeof import("@/services/PluginWorkflowService").PluginWorkflowService;
	readonly PluginUpdateOrchestrator: typeof import("@/services/PluginUpdateOrchestrator").PluginUpdateOrchestrator;
	readonly PluginChangelogService: typeof import("@/services/PluginChangelogService").PluginChangelogService;
	readonly UIService: typeof import("@/services/UIService").UIService;
	readonly CanaryStore: typeof import("@/store/CanaryStore").CanaryStore;
	readonly CEWindowManager: typeof import("@/ui/managers/CEWindowManager").CEWindowManager;
	readonly PluginCommands: typeof import("@/ui/PluginCommands").default;
	readonly GitHubAssetService: typeof import("@/services/github/GitHubAssetService").GitHubAssetService;
	readonly GitHubCacheService: typeof import("@/services/github/GitHubCacheService").GitHubCacheService;
	readonly GitHubClient: typeof import("@/services/github/GitHubClient").GitHubClient;
	readonly GitHubContentService: typeof import("@/services/github/GitHubContentService").GitHubContentService;
	readonly GitHubRateLimitService: typeof import("@/services/github/GitHubRateLimitService").GitHubRateLimitService;
	readonly GitHubReleaseService: typeof import("@/services/github/GitHubReleaseService").GitHubReleaseService;
	readonly GitHubRepositoryService: typeof import("@/services/github/GitHubRepositoryService").GitHubRepositoryService;
	readonly GitHubTokenService: typeof import("@/services/github/GitHubTokenService").GitHubTokenService;
	readonly PluginLifecycle: typeof import("@/services/PluginLifecycle").PluginLifecycle;
	readonly PluginInstaller: typeof import("@/services/PluginInstaller").PluginInstaller;
	readonly BratIntegrationService: typeof import("@/services/BratIntegrationService").BratIntegrationService;
	readonly CancellationService: typeof import("@/services/CancellationService").CancellationService;
	readonly IndexedDBService: typeof import("@/services/infrastructure/IndexedDBService").IndexedDBService;
}

export interface Cradle {
	readonly plugin: import("@/main").default;
	readonly settingsService: import("@/services/SettingsService").SettingsService;
	readonly notificationService: import("@/services/ui/NotificationService").NotificationService;
	readonly concurrencyService: import("@/services/ConcurrencyService").ConcurrencyService;
	readonly operationTrackingService: import("@/services/OperationTrackingService").OperationTrackingService;
	readonly pluginCompatibilityService: import("@/services/PluginCompatibilityService").PluginCompatibilityService;
	readonly manifestMutationService: import("@/services/ManifestMutationService").ManifestMutationService;
	readonly repositoryService: import("@/services/RepositoryService").RepositoryService;
	readonly pluginQueryService: import("@/services/PluginQueryService").PluginQueryService;
	readonly pluginAcquisitionService: import("@/services/PluginAcquisitionService").PluginAcquisitionService;
	readonly pluginDeploymentService: import("@/services/PluginDeploymentService").PluginDeploymentService;
	readonly pluginInstallOperation: import("@/services/operations/PluginInstallOperation").PluginInstallOperation;
	readonly pluginUpdateOperation: import("@/services/operations/PluginUpdateOperation").PluginUpdateOperation;
	readonly pluginRegisterOperation: import("@/services/operations/PluginRegisterOperation").PluginRegisterOperation;
	readonly pluginDeleteOperation: import("@/services/operations/PluginDeleteOperation").PluginDeleteOperation;
	readonly pluginSaveSettingsOperation: import("@/services/operations/PluginSaveSettingsOperation").PluginSaveSettingsOperation;
	readonly workflowNotificationPresenter: import("@/services/operations/WorkflowNotificationPresenter").WorkflowNotificationPresenter;
	readonly pluginWorkflowService: import("@/services/PluginWorkflowService").PluginWorkflowService;
	readonly pluginUpdateOrchestrator: import("@/services/PluginUpdateOrchestrator").PluginUpdateOrchestrator;
	readonly pluginChangelogService: import("@/services/PluginChangelogService").PluginChangelogService;
	readonly uiService: import("@/services/UIService").UIService;
	readonly canaryStore: import("@/store/CanaryStore").CanaryStore;
	readonly ceWindowManager: import("@/ui/managers/CEWindowManager").CEWindowManager;
	readonly pluginCommands: import("@/ui/PluginCommands").default;
	readonly gitHubAssetService: import("@/services/github/GitHubAssetService").GitHubAssetService;
	readonly gitHubCacheService: import("@/services/github/GitHubCacheService").GitHubCacheService;
	readonly gitHubClient: import("@/services/github/GitHubClient").GitHubClient;
	readonly gitHubContentService: import("@/services/github/GitHubContentService").GitHubContentService;
	readonly gitHubRateLimitService: import("@/services/github/GitHubRateLimitService").GitHubRateLimitService;
	readonly gitHubReleaseService: import("@/services/github/GitHubReleaseService").GitHubReleaseService;
	readonly gitHubRepositoryService: import("@/services/github/GitHubRepositoryService").GitHubRepositoryService;
	readonly gitHubTokenService: import("@/services/github/GitHubTokenService").GitHubTokenService;
	readonly pluginLifecycle: import("@/services/PluginLifecycle").PluginLifecycle;
	readonly pluginInstaller: import("@/services/PluginInstaller").PluginInstaller;
	readonly bratIntegrationService: import("@/services/BratIntegrationService").BratIntegrationService;
	readonly cancellationService: import("@/services/CancellationService").CancellationService;
	readonly indexedDbService: import("@/services/infrastructure/IndexedDBService").IndexedDBService;
}

export interface CoreModules {
	readonly container: AwilixContainer<Cradle>;
	readonly DEFAULT_SETTINGS_VALUES: typeof DEFAULT_SETTINGS_VALUES;
	readonly asClass: typeof asClass;
	readonly asValue: typeof asValue;
}

export type ReleaseChannel = "stable" | "beta" | "canary";
export type ShowChangelogMode = "before" | "after";
export type ChangelogPriority = "release_notes" | "changelog_file";
type PluginStatus = "frozen" | "active";
type CompatibilityStatus = "incompatible";
export type DashboardFilterType = "frozen" | "incompatible" | "untracked" | "installing";

export interface UpdateIntervalConfig {
	readonly value: string | false;
	readonly autoDownload: boolean;
}

export interface UpdateCheckOnLoadConfig {
	readonly enabled: boolean;
	readonly autoDownload: boolean;
}

export interface ShowChangelogConfig {
	readonly mode: ShowChangelogMode;
	readonly priority: ChangelogPriority;
}

interface GlobalConfig {
	readonly autoEnable: boolean;
	readonly showChangelog: ShowChangelogConfig;
	readonly tokenSecretId: string | false;
	readonly updateInterval: UpdateIntervalConfig;
	readonly releaseChannel: ReleaseChannel;
	readonly updateCheckOnLoad: UpdateCheckOnLoadConfig;
	readonly forceInstall: {
		readonly version: boolean;
		readonly platform: boolean;
	};
	readonly enableBratSync: boolean;
}

export interface PluginConfig {
	readonly status?: PluginStatus | undefined;
	readonly compatibility?: CompatibilityStatus | undefined;
	readonly tokenSecretId?: string | undefined;
	readonly lastChecked?: number | undefined;
	readonly releaseChannel?: ReleaseChannel | undefined;
	readonly updateInterval?: {
		readonly value?: string | false | undefined;
		readonly autoDownload?: boolean | undefined;
	} | undefined;
	readonly showChangelog?: {
		readonly mode?: ShowChangelogMode | undefined;
		readonly priority?: ChangelogPriority | undefined;
	} | undefined;
	readonly autoEnable?: boolean | undefined;
	readonly updateCheckOnLoad?: {
		readonly enabled?: boolean | undefined;
		readonly autoDownload?: boolean | undefined;
	} | undefined;
	readonly forceInstall?: {
		readonly version?: boolean | undefined;
		readonly platform?: boolean | undefined;
	} | undefined;
}

export interface Settings {
	readonly global: GlobalConfig;
	readonly plugins: Record<string, PluginConfig>;
	readonly version: number;
}

export interface ResolvedPluginConfiguration {
	readonly autoEnable: boolean;
	readonly showChangelog: ShowChangelogConfig;
	readonly tokenSecretId: string | false;
	readonly updateInterval: UpdateIntervalConfig;
	readonly releaseChannel: ReleaseChannel;
	readonly updateCheckOnLoad: UpdateCheckOnLoadConfig;
	readonly forceInstall: {
		readonly version: boolean;
		readonly platform: boolean;
	};
}

export type PluginConfigurationOverrides = {
	[K in keyof ResolvedPluginConfiguration]?: ResolvedPluginConfiguration[K] | undefined;
};

export type NotificationLevel = "info" | "warn" | "error" | "debug";

export interface AppNotificationOptions {
	readonly timeout?: number | undefined;
	readonly contextMenuCallback?: (() => void) | undefined;
	readonly context?: string | undefined;
}

export interface NotificationHandle {
	readonly updateMessage: (message: unknown) => Result<undefined>;
	readonly hide: () => Result<undefined>;
}

export type OperationType = "install" | "update" | "delete" | "check" | "settings";
type OperationStatus = "pending" | "success" | "error";

export interface OperationState {
	readonly type: OperationType;
	readonly step: string;
	readonly message: string;
	readonly status: OperationStatus;
	readonly timestamp: number;
	readonly error?: string | undefined;
	readonly errorDetails?: unknown;
}

export interface OperationGuard {
	readonly update: (step: string, message: string) => Result<undefined>;
	readonly complete: (finalMessage?: string) => Result<undefined>;
	readonly fail: (error: unknown) => Result<undefined>;
	readonly cleanup: (taskSucceeded: boolean, fallbackErrorMessage?: string) => void;
}

export type OverrideHandler = (request: Readonly<OverrideRequest>) => Promise<Result<boolean>>;
type ProgressHandler = (step: string, message: string) => Result<undefined>;

export interface OperationContextOptions {
	readonly repo: string;
	readonly operationType: OperationType;
	readonly signal?: AbortSignal | undefined;
	readonly safeCtx?: Api | undefined;
	readonly token?: string | undefined;
	readonly secretId?: string | undefined;
	readonly overrides?: PluginConfigurationOverrides | undefined;
	readonly guard?: OperationGuard | undefined;
	readonly onOverrideRequest?: OverrideHandler | undefined;
	readonly priority?: number | undefined;
	readonly isBulk?: boolean | undefined;
}

export interface OperationContext {
	readonly repo: string;
	readonly operationType: OperationType;
	readonly signal: AbortSignal;
	readonly safeCtx: Api;
	readonly token: string;
	readonly secretId: string;
	readonly overrides: PluginConfigurationOverrides | undefined;
	readonly guard: OperationGuard | undefined;
	readonly onOverrideRequest: OverrideHandler | undefined;
	readonly priority: number | undefined;
	readonly isBulk: boolean | undefined;
	readonly progress: ProgressHandler;
	readonly withGuard: (guard: OperationGuard) => OperationContext;
	readonly withToken: (token: string, secretId?: string) => OperationContext;
	readonly withOverrides: (overrides?: PluginConfigurationOverrides) => OperationContext;
}

export interface DetectedUpdate {
	readonly id: string;
	readonly repo: string;
	readonly version: string;
	readonly localVersion: string;
	readonly detectedAt: number;
	readonly releaseUrl?: string | undefined;
	readonly releaseNotes?: string | undefined;
}

export interface RateLimitData {
	readonly limit: number;
	readonly remaining: number;
	readonly reset: number;
	readonly used: number;
	readonly resource: string;
	readonly scopes: readonly string[];
	readonly timestamp: number;
}

export interface ReleaseVersion {
	readonly version: string;
	readonly prerelease: boolean;
	readonly publishedAt: string;
}

export interface GitHubTokenInfo {
	readonly validToken: boolean;
	readonly currentScopes: readonly string[];
	readonly acceptedScopes: readonly string[];
	readonly acceptedPermissions: readonly string[];
	readonly expirationDate: string | null;
	readonly rateLimit: {
		readonly limit: number;
		readonly remaining: number;
		readonly reset: number;
		readonly resource: string;
		readonly used: number;
	};
	readonly error: TokenValidationError;
}

export enum TokenErrorType {
	INVALID_PREFIX = "invalid_prefix",
	INVALID_FORMAT = "invalid_format",
	EXPIRED = "expired",
	INSUFFICIENT_SCOPE = "insufficient_scope",
	NONE = "none",
	UNKNOWN = "unknown",
}

export interface TokenValidationError {
	readonly type: TokenErrorType;
	readonly message: string;
	readonly details: {
		readonly validPrefixes?: readonly string[] | undefined;
		readonly expirationDate?: string | undefined;
		readonly requiredScopes?: readonly string[] | undefined;
		readonly currentScopes?: readonly string[] | undefined;
	};
}

export type { CommunityPlugin, Release, PluginManifestEx };

export interface ReleaseFiles {
	readonly mainJs: ArrayBuffer | null;
	readonly manifest: string | null;
	readonly styles: ArrayBuffer | null;
}

type ChangelogStrategy = "release_notes" | "changelog_file" | "fallback";

export interface FetchChangelogOptions {
	readonly repositoryPath: string;
	readonly version?: string | undefined;
	readonly strategy?: ChangelogStrategy | undefined;
	readonly priority?: ChangelogPriority | undefined;
	readonly includePrerelease?: boolean | undefined;
	readonly releaseChannel?: ReleaseChannel | undefined;
}

export interface RepositoryValidationResult {
	readonly manifest: PluginManifest;
	readonly release: Release;
}

export interface ValidationContext extends RepositoryValidationResult {
	readonly usingBetaManifest: boolean;
}

export interface ConfirmRequest {
	readonly id: string;
	readonly request: OverrideRequest;
	readonly resolve: (value: boolean) => void;
}

export interface ChangelogProceedRequest {
	readonly repo: string;
	readonly version: string;
	readonly changelog: string;
	readonly mode: ShowChangelogMode;
}

export interface ChangelogRequest {
	readonly id: string;
	readonly request: ChangelogProceedRequest;
	readonly resolve: (value: boolean) => void;
}

export type ActivePrompt =
	| { readonly kind: "confirm"; readonly request: ConfirmRequest }
	| { readonly kind: "changelog"; readonly request: ChangelogRequest };

export interface InstallPluginModalOptions {
	readonly prefillRepo?: string | undefined;
	readonly prefillVersion?: string | undefined;
	readonly prefillReleaseChannel?: ReleaseChannel | undefined;
	readonly onSuccess?: (() => void) | undefined;
}

export interface PreparedRelease {
	readonly manifest: PluginManifestEx;
	readonly files: ReleaseFiles;
	readonly isIncompatible: boolean;
}

export type OverrideRequest =
	| { readonly type: "appVersion"; readonly repo: string; readonly minVersion: string; readonly currentVersion: string }
	| { readonly type: "platform"; readonly repo: string; readonly isDesktopOnly: boolean }
	| { readonly type: "resetSettings"; readonly repo: string }
	| { readonly type: "unregister"; readonly repo: string }
	| { readonly type: "unregisterAndDelete"; readonly repo: string }
	| { readonly type: "register"; readonly repo: string; readonly channel?: ReleaseChannel | undefined }
	| { readonly type: "resetWindowState"; readonly repo: string };

export interface AcquisitionOptions {
	readonly specifyVersion: string;
	readonly context?: ValidationContext | undefined;
	readonly preResolvedRelease?: { readonly release: Release } | undefined;
}

export interface PluginListItem {
	readonly repo: string;
	readonly version: string;
	readonly isFrozen: boolean;
	readonly tokenSecretId?: string | undefined;
}

export interface AddPluginOptions {
	readonly repositoryPath: string;
	readonly updatePluginFiles?: boolean | undefined;
	readonly seeIfUpdatedOnly?: boolean | undefined;
	readonly reportIfNotUpdated?: boolean | undefined;
	readonly specifyVersion?: string | undefined;
	readonly forceReinstall?: boolean | undefined;
	readonly enableAfterInstall?: boolean | undefined;
	readonly privateApiKeySecretId?: string | undefined;
	readonly isFrozen?: boolean | undefined;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
	readonly overrides?: PluginConfigurationOverrides | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly priority?: number | undefined;
	readonly isBulk?: boolean | undefined;
}

export interface UpdatePluginOptions {
	readonly repositoryPath: string;
	readonly onlyCheckDontUpdate?: boolean | undefined;
	readonly reportIfNotUpdated?: boolean | undefined;
	readonly forceReinstall?: boolean | undefined;
	readonly privateApiKeySecretId?: string | undefined;
	readonly skipNetworkCheck?: boolean | undefined;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly priority?: number | undefined;
	readonly isBulk?: boolean | undefined;
}

export interface SavePluginSettingsOptions {
	readonly repositoryPath: string;
	readonly isFrozen: boolean;
	readonly privateApiKeySecretId: string;
	readonly enableAfterInstall: boolean;
	readonly isIncompatible?: boolean | undefined;
	readonly overrides?: PluginConfigurationOverrides | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly priority?: number | undefined;
}

export interface InstallOptions {
	readonly specifyVersion: string;
	readonly forceReinstall: boolean;
	readonly enableAfterInstall: boolean;
	readonly isFrozen: boolean;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
}

export interface UpdateOptions {
	readonly specifyVersion: string;
	readonly enableAfterInstall: boolean;
	readonly seeIfUpdatedOnly: boolean;
	readonly reportIfNotUpdated: boolean;
	readonly forceReinstall?: boolean | undefined;
	readonly onChangelogReady?: ((changelog: string) => void) | undefined;
}

export interface DeploymentOptions {
	readonly manifest: Readonly<PluginManifestEx>;
	readonly files: Readonly<ReleaseFiles>;
	readonly isIncompatible: boolean;
	readonly isFrozen: boolean;
	readonly enableAfterInstall: boolean;
	readonly isReinstall: boolean;
	readonly expectedVersion: number;
}

export type PluginLifecycleAction =
	| "installed"
	| "reinstalled"
	| "upgraded"
	| "downgraded"
	| "unchanged";

export interface InstallOperationResult {
	readonly wasInstalled: boolean;
	readonly action: PluginLifecycleAction;
	readonly version: string;
	readonly previousVersion?: string | undefined;
}

export type PluginUpdateStatus =
	| "upgraded"
	| "downgraded"
	| "reinstalled"
	| "update_available"
	| "up_to_date"
	| "cancelled";

export interface UpdateOperationResult {
	readonly wasUpdated: boolean;
	readonly status: PluginUpdateStatus;
	readonly version?: string | undefined;
	readonly previousVersion?: string | undefined;
	readonly noUpdateAvailable?: boolean | undefined;
	readonly updateAvailableDetails?: { readonly local: string; readonly remote: string } | undefined;
}
