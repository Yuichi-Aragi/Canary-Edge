import type { App, PluginManifest, SettingTab } from "obsidian";

interface InternalSettingTab extends SettingTab {
	readonly id: string;
	readonly name: string;
}

export interface InternalPlugins {
	readonly manifests: Readonly<Record<string, PluginManifest>>;
	readonly plugins: Readonly<Record<string, { readonly manifest: PluginManifest }>>;
	readonly enabledPlugins: ReadonlySet<string>;
	readonly getPluginFolder: () => string;
	readonly disablePlugin: (id: string) => Promise<void>;
	readonly disablePluginAndSave: (id: string) => Promise<void>;
	readonly enablePlugin: (id: string) => Promise<void>;
	readonly enablePluginAndSave: (id: string) => Promise<void>;
	readonly loadManifest: (path: string) => Promise<void>;
	readonly loadManifests: () => Promise<void>;
	readonly getPlugin: (id: string) => unknown;
}

interface InternalSetting {
	readonly open: () => void;
	readonly openTabById: (id: string) => void;
	readonly pluginTabs: Readonly<Record<string, InternalSettingTab>>;
	readonly settingTabs: Readonly<Record<string, InternalSettingTab>>;
	readonly activeTab: InternalSettingTab | null;
}

export interface InternalApp extends App {
	readonly plugins: InternalPlugins;
	readonly setting: InternalSetting;
	readonly commands: {
		readonly executeCommandById: (id: string) => boolean;
		readonly listCommands: () => readonly { readonly id: string; readonly name: string }[];
	};
}
