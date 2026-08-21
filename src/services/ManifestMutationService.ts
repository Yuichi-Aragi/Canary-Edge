import { create, type Draft } from "mutative";
import { apiVersion } from "obsidian";
import invariant from "tiny-invariant";

import type { PluginManifestEx } from "@/domain/types";
import { safe, type Result } from "@/utils/safe";

export class ManifestMutationService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public prepareManifest(
		baseManifest: PluginManifestEx,
		isIncompatible: boolean,
		overrideDesktopOnly: boolean,
	): Result<PluginManifestEx> {
		return this.safeCtx((): PluginManifestEx => {
			invariant(baseManifest.id !== "", "baseManifest must have an ID");

			if (isIncompatible === false && overrideDesktopOnly === false) {
				return baseManifest;
			}

			return create(baseManifest, (draft: Draft<PluginManifestEx>): void => {
				if (isIncompatible === true) {
					draft.brat ??= {};
					draft.brat.isIncompatible = true;
					draft.brat.minAppVersionOriginal = draft.minAppVersion;
					draft.minAppVersion = apiVersion;
				}

				if (overrideDesktopOnly === true) {
					draft.isDesktopOnly = false;
					draft.brat ??= {};
					draft.brat.isDesktopOnlyOriginal = true;
					draft.brat.isIncompatible = true;
				}
			});
		});
	}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}
}
