import { normalizePath } from "obsidian";
import invariant from "tiny-invariant";

import { resolveApiContext } from "@/utils/contextUtils";
import { safe } from "@/utils/safe";

import type { DataAdapter } from "obsidian";
import type { Cradle, OperationContext, ReleaseFiles } from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

const PLUGIN_DIR = "plugins";

type AssetName = "main.js" | "styles.css" | "manifest.json";

interface BinaryAsset {
	readonly name: Extract<AssetName, "main.js" | "styles.css">;
	readonly type: "binary";
	readonly content: ArrayBuffer | null | undefined;
}

interface TextAsset {
	readonly name: Extract<AssetName, "manifest.json">;
	readonly type: "text";
	readonly content: string | null | undefined;
}

type ReleaseAsset = BinaryAsset | TextAsset;

interface FileBackup {
	readonly "main.js": ArrayBuffer | null;
	readonly "styles.css": ArrayBuffer | null;
	readonly "manifest.json": string | null;
}

function getPluginFolderPath(configDir: string, pluginId: string): string {
	return `${normalizePath(`${configDir}/${PLUGIN_DIR}/${pluginId}`)}/`;
}

function createReleaseAssets(relFiles: Readonly<ReleaseFiles>): readonly ReleaseAsset[] {
	return [
		{ name: "main.js", type: "binary", content: relFiles.mainJs },
		{ name: "styles.css", type: "binary", content: relFiles.styles },
		{ name: "manifest.json", type: "text", content: relFiles.manifest ?? "" },
	];
}

export class PluginInstaller {
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
	}

	public async writeReleaseFilesToPluginFolder(
		betaPluginId: string,
		relFiles: Readonly<ReleaseFiles>,
		ctx?: OperationContext | Api,
	): Promise<Result<undefined>> {
		const boundCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return boundCtx.async<undefined>(async ($, defer) => {
			$.checkpoint();
			invariant(betaPluginId !== "", "Plugin ID is required");

			const targetFolder = getPluginFolderPath(this.deps.plugin.app.vault.configDir, betaPluginId);
			const { adapter } = this.deps.plugin.app.vault;
			const assets = createReleaseAssets(relFiles);
			const existsBefore = await adapter.exists(targetFolder);

			let backup: FileBackup | null = null;
			let writeCompleted = false;

			defer(async (): Promise<void> => {
				if (writeCompleted) {
					return;
				}

				console.warn(`[Canary-Edge] [Installer] [${betaPluginId}] Rolling back vault file operations...`);

				if (existsBefore && backup !== null) {
					for (const asset of assets) {
						const restored = backup[asset.name];
						const filePath = `${targetFolder}${asset.name}`;

						if (typeof restored === "string") {
							await safe.tryAsync(async (): Promise<void> => {
								await adapter.write(filePath, restored);
							});
						} else if (restored instanceof ArrayBuffer) {
							await safe.tryAsync(async (): Promise<void> => {
								await adapter.writeBinary(filePath, restored);
							});
						} else {
							await this.safeRemove(adapter, filePath);
						}
					}
				} else {
					for (const asset of assets) {
						await this.safeRemove(adapter, `${targetFolder}${asset.name}`);
					}
					await this.safeRemoveFolder(adapter, targetFolder);
				}
			});

			if (existsBefore) {
				let oldMainJs: ArrayBuffer | null = null;
				let oldStyles: ArrayBuffer | null = null;
				let oldManifest: string | null = null;

				for (const asset of assets) {
					$.checkpoint();
					const filePath = `${targetFolder}${asset.name}`;
					const fileExists = safe.unwrapOr(
						await safe.tryAsync(async (): Promise<boolean> => {
							return adapter.exists(filePath);
						}),
						false,
					);

					if (fileExists) {
						if (asset.type === "binary") {
							const data = safe.unwrapOr(
								await safe.tryAsync(async (): Promise<ArrayBuffer> => {
									return adapter.readBinary(filePath);
								}),
								null,
							);
							if (asset.name === "main.js") {
								oldMainJs = data;
							} else {
								oldStyles = data;
							}
						} else {
							oldManifest = safe.unwrapOr(
								await safe.tryAsync(async (): Promise<string> => {
									return adapter.read(filePath);
								}),
								null,
							);
						}
					}
				}

				backup = {
					"main.js": oldMainJs,
					"styles.css": oldStyles,
					"manifest.json": oldManifest,
				};
			} else {
				$.checkpoint();
				await adapter.mkdir(targetFolder);
			}

			for (const asset of assets) {
				$.checkpoint();
				if (asset.content !== null && asset.content !== undefined) {
					const filePath = `${targetFolder}${asset.name}`;
					if (asset.type === "binary") {
						await adapter.writeBinary(filePath, asset.content);
					} else {
						await adapter.write(filePath, asset.content);
					}
				}
			}

			$.checkpoint();
			writeCompleted = true;
			return undefined;
		});
	}

	public async readLocalManifest(
		pluginId: string,
		ctx?: OperationContext | Api | AbortSignal,
	): Promise<Result<string>> {
		const boundCtx = safe.from(resolveApiContext(ctx)).bind(this);
		return boundCtx.async<string>(async ($) => {
			$.checkpoint();
			invariant(pluginId !== "", "Plugin ID is required");

			const targetFolder = getPluginFolderPath(this.deps.plugin.app.vault.configDir, pluginId);
			return this.deps.plugin.app.vault.adapter.read(`${targetFolder}manifest.json`);
		});
	}

	private async safeRemove(adapter: Readonly<DataAdapter>, filePath: string): Promise<void> {
		const exists = safe.unwrapOr(
			await safe.tryAsync(async (): Promise<boolean> => {
				return adapter.exists(filePath);
			}),
			false,
		);
		if (exists) {
			await safe.tryAsync(async (): Promise<void> => {
				await adapter.remove(filePath);
			});
		}
	}

	private async safeRemoveFolder(adapter: Readonly<DataAdapter>, folderPath: string): Promise<void> {
		const exists = safe.unwrapOr(
			await safe.tryAsync(async (): Promise<boolean> => {
				return adapter.exists(folderPath);
			}),
			false,
		);
		if (!exists) {
			return;
		}

		if (
			"rmdir" in adapter &&
			typeof (adapter as unknown as { readonly rmdir: (p: string, recursive: boolean) => Promise<void> }).rmdir ===
				"function"
		) {
			await safe.tryAsync(async (): Promise<void> => {
				await (adapter as unknown as { readonly rmdir: (p: string, recursive: boolean) => Promise<void> }).rmdir(
					folderPath,
					true,
				);
			});
		} else {
			await safe.tryAsync(async (): Promise<void> => {
				await adapter.remove(folderPath);
			});
		}
	}
}
