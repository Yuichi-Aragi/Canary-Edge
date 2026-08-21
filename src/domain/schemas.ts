import * as v from "valibot";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

export const IDENTIFIER_REGEXP = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
export const CANARY_EDGE_PLUGIN_ID = "canary-edge";

export function isCanaryEdge(identifier: string, ownManifestId?: string): boolean {
	if (typeof identifier !== "string") {
		return false;
	}
	const trimmed = identifier.trim().toLowerCase();
	if (trimmed === "") {
		return false;
	}
	if (trimmed === CANARY_EDGE_PLUGIN_ID) {
		return true;
	}
	if (ownManifestId !== undefined && ownManifestId !== "" && trimmed === ownManifestId.trim().toLowerCase()) {
		return true;
	}
	const scrubbed = scrubRepositoryUrl(trimmed).toLowerCase();
	if (scrubbed === CANARY_EDGE_PLUGIN_ID) {
		return true;
	}
	if (scrubbed.endsWith(`/${CANARY_EDGE_PLUGIN_ID}`) === true) {
		return true;
	}
	if (ownManifestId !== undefined && ownManifestId !== "") {
		const ownIdLower = ownManifestId.trim().toLowerCase();
		if (scrubbed === ownIdLower || scrubbed.endsWith(`/${ownIdLower}`) === true) {
			return true;
		}
	}
	const parts = scrubbed.split("/");
	const lastPart = parts[parts.length - 1];
	return lastPart === CANARY_EDGE_PLUGIN_ID || (ownManifestId !== undefined && lastPart === ownManifestId.trim().toLowerCase());
}

export const RepositoryUrlSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Repository cannot be empty"),
	v.transform(scrubRepositoryUrl),
	v.regex(
		IDENTIFIER_REGEXP,
		"Invalid format. Could not identify a GitHub 'User/Repo' from the input.",
	),
);

export const CommunityPluginSchema = v.object({
	id: v.string(),
	name: v.string(),
	author: v.string(),
	description: v.string(),
	repo: v.string(),
});

export const ReleaseAssetSchema = v.object({
	id: v.fallback(v.union([v.number(), v.string()]), 0),
	name: v.string(),
	url: v.string(),
	browser_download_url: v.string(),
});

export const ReleaseSchema = v.object({
	url: v.string(),
	tag_name: v.string(),
	name: v.fallback(v.nullable(v.string()), ""),
	published_at: v.string(),
	prerelease: v.boolean(),
	draft: v.fallback(v.boolean(), false),
	body: v.optional(v.nullable(v.string())),
	assets: v.array(ReleaseAssetSchema),
});

export const GitHubRateLimitCoreSchema = v.object({
	limit: v.number(),
	remaining: v.number(),
	reset: v.number(),
	used: v.fallback(v.number(), 0),
});

export const GitHubRateLimitResponseSchema = v.object({
	data: v.object({
		rate: v.optional(GitHubRateLimitCoreSchema),
		resources: v.optional(
			v.object({
				core: v.optional(GitHubRateLimitCoreSchema),
			}),
		),
	}),
	headers: v.fallback(v.record(v.string(), v.unknown()), {}),
});

export const PluginManifestSchema = v.object({
	id: v.string(),
	name: v.string(),
	version: v.string(),
	minAppVersion: v.fallback(v.string(), "0.15.0"),
	description: v.fallback(v.string(), ""),
	author: v.fallback(v.string(), ""),
	authorUrl: v.optional(v.string()),
	isDesktopOnly: v.optional(v.boolean()),
	dir: v.optional(v.string()),
});

export const PluginManifestExSchema = v.intersect([
	PluginManifestSchema,
	v.object({
		brat: v.optional(
			v.object({
				isIncompatible: v.optional(v.boolean()),
				isDesktopOnlyOriginal: v.optional(v.boolean()),
				minAppVersionOriginal: v.optional(v.string()),
			}),
		),
	}),
]);

export const ReleaseChannelSchema = v.union([
	v.literal("stable"),
	v.literal("beta"),
	v.literal("canary"),
]);

export const ShowChangelogModeSchema = v.union([
	v.literal("before"),
	v.literal("after"),
]);

export const ShowChangelogSchema = ShowChangelogModeSchema;

export const ChangelogPrioritySchema = v.union([
	v.literal("release_notes"),
	v.literal("changelog_file"),
]);

export const ShowChangelogConfigSchema = v.object({
	mode: v.fallback(ShowChangelogModeSchema, "after"),
	priority: v.fallback(ChangelogPrioritySchema, "release_notes"),
});

export const PluginShowChangelogSchema = v.object({
	mode: v.optional(ShowChangelogModeSchema),
	priority: v.optional(ChangelogPrioritySchema),
});

export const ForceInstallSchema = v.object({
	version: v.fallback(v.boolean(), false),
	platform: v.fallback(v.boolean(), false),
});

export const UpdateIntervalConfigSchema = v.object({
	value: v.fallback(v.union([v.string(), v.literal(false)]), false),
	autoDownload: v.fallback(v.boolean(), true),
});

export const UpdateCheckOnLoadConfigSchema = v.object({
	enabled: v.fallback(v.boolean(), false),
	autoDownload: v.fallback(v.boolean(), true),
});

export const PluginUpdateIntervalSchema = v.object({
	value: v.optional(v.union([v.string(), v.literal(false)])),
	autoDownload: v.optional(v.boolean()),
});

export const PluginUpdateCheckOnLoadSchema = v.object({
	enabled: v.optional(v.boolean()),
	autoDownload: v.optional(v.boolean()),
});

export const PluginConfigSchema = v.object({
	status: v.optional(v.union([v.literal("frozen"), v.literal("active")])),
	compatibility: v.optional(v.literal("incompatible")),
	tokenSecretId: v.optional(v.string()),
	lastChecked: v.optional(v.number()),
	releaseChannel: v.optional(ReleaseChannelSchema),
	updateInterval: v.optional(PluginUpdateIntervalSchema),
	showChangelog: v.optional(PluginShowChangelogSchema),
	autoEnable: v.optional(v.boolean()),
	updateCheckOnLoad: v.optional(PluginUpdateCheckOnLoadSchema),
	forceInstall: v.optional(
		v.object({
			version: v.optional(v.boolean()),
			platform: v.optional(v.boolean()),
		}),
	),
});

export const GlobalConfigSchema = v.object({
	autoEnable: v.fallback(v.boolean(), true),
	showChangelog: v.fallback(ShowChangelogConfigSchema, { mode: "before", priority: "release_notes" }),
	tokenSecretId: v.fallback(v.union([v.string(), v.literal(false)]), false),
	updateInterval: v.fallback(UpdateIntervalConfigSchema, { value: false, autoDownload: false }),
	releaseChannel: v.fallback(ReleaseChannelSchema, "beta"),
	updateCheckOnLoad: v.fallback(UpdateCheckOnLoadConfigSchema, { enabled: true, autoDownload: false }),
	forceInstall: v.fallback(ForceInstallSchema, { version: false, platform: false }),
	enableBratSync: v.fallback(v.boolean(), true),
});

export const SettingsSchema = v.object({
	global: v.fallback(GlobalConfigSchema, {
		autoEnable: true,
		showChangelog: {
			mode: "before",
			priority: "release_notes",
		},
		tokenSecretId: false,
		updateInterval: {
			value: false,
			autoDownload: false,
		},
		releaseChannel: "beta",
		updateCheckOnLoad: {
			enabled: true,
			autoDownload: false,
		},
		forceInstall: {
			version: false,
			platform: false,
		},
		enableBratSync: true,
	}),
	plugins: v.fallback(v.record(v.string(), PluginConfigSchema), {}),
	version: v.fallback(v.number(), 0),
});

export const InstallPluginFormSchema = v.pipe(
	v.object({
		repositoryUrl: RepositoryUrlSchema,
		version: v.string("Version is required"),
		usePrivateApiKey: v.boolean(),
		privateApiKeySecretId: v.optional(v.string()),
		autoEnable: v.boolean(),
		showChangelog: ShowChangelogConfigSchema,
		updateCheckOnLoad: v.object({
			enabled: v.boolean(),
			autoDownload: v.boolean(),
		}),
		updateInterval: v.object({
			value: v.union([v.string(), v.literal(false)]),
			autoDownload: v.boolean(),
		}),
		releaseChannel: ReleaseChannelSchema,
		status: v.union([v.literal("frozen"), v.literal("active")]),
		forceInstall: v.object({
			version: v.boolean(),
			platform: v.boolean(),
		}),
	}),
	v.forward(
		v.check((input): boolean => {
			if (input.usePrivateApiKey === true) {
				const secretId = input.privateApiKeySecretId;
				return typeof secretId === "string" && secretId.trim().length > 0;
			}
			return true;
		}, "Secret selection is required when enabled"),
		["privateApiKeySecretId"],
	),
);

export type InstallPluginFormData = v.InferOutput<typeof InstallPluginFormSchema>;
export type CommunityPlugin = v.InferOutput<typeof CommunityPluginSchema>;
export type Release = v.InferOutput<typeof ReleaseSchema>;
export type PluginManifestEx = v.InferOutput<typeof PluginManifestExSchema>;

export const DEFAULT_SETTINGS_VALUES: v.InferOutput<typeof SettingsSchema> = {
	global: {
		autoEnable: true,
		showChangelog: {
			mode: "before",
			priority: "release_notes",
		},
		tokenSecretId: false,
		updateInterval: {
			value: false,
			autoDownload: false,
		},
		releaseChannel: "beta",
		updateCheckOnLoad: {
			enabled: true,
			autoDownload: false,
		},
		forceInstall: {
			version: false,
			platform: false,
		},
		enableBratSync: true,
	},
	plugins: {},
	version: 0,
};
