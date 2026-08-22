import { useCallback, useMemo, useRef, lazy } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { match } from "ts-pattern";

import { createOperationContext } from "@/services/OperationContext";
import { BasePanel } from "@/ui/components/BasePanel";
import { Button } from "@/ui/components/BaseComponents";
import { CategorySelector } from "@/ui/components/CategorySelector";
import { PluginCard } from "@/ui/components/PluginCard";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { LazyPanelBoundary } from "@/ui/components/LazyPanelBoundary";
import { MarkdownView } from "@/ui/components/MarkdownView";
import { StateContainer } from "@/ui/components/StateContainer";
import { useCanaryActions } from "@/ui/hooks/useCanaryStore";
import { useDerivedReset } from "@/ui/hooks/useDerivedReset";
import { useCategoryTab } from "@/ui/hooks/useCategoryTab";
import { useRemoteManifest } from "@/ui/hooks/useGitHub";
import { useService } from "@/ui/hooks/useService";
import { safe } from "@/utils/safe";

import type { JSX } from "react";
import type { ChangelogRequest } from "@/domain/types";
import type { PluginCardOverrideData } from "@/ui/hooks/usePluginCardViewModel";

gsap.registerPlugin(useGSAP);

const LazySharedReadmeTab = lazy(async () => {
	const mod = await import("@/ui/components/SharedReadmeTab");
	return { default: mod.SharedReadmeTab };
});

export type ChangelogCategory = "Changelog" | "README";

const CHANGELOG_CATEGORIES: readonly ChangelogCategory[] = ["Changelog", "README"] as const;

export interface ChangelogPanelProps {
	readonly request: ChangelogRequest;
}

export function ChangelogPanel({ request }: ChangelogPanelProps): JSX.Element {
	const dismissChangelogById = useCanaryActions((actions) => actions.dismissChangelogById);
	const settingsService = useService("settingsService");
	const compatibilityService = useService("pluginCompatibilityService");

	const containerRef = useRef<HTMLDivElement>(null);
	const isProcessingRef = useRef<boolean>(false);

	const { activeCategory, setActiveCategory } = useCategoryTab<ChangelogCategory>("Changelog");

	useDerivedReset(request.id, (): void => {
		isProcessingRef.current = false;
		setActiveCategory("Changelog");
	});

	useGSAP(
		(): void => {
			const container = containerRef.current;
			if (container === null) {
				return;
			}

			const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			const elements = Array.from(container.children);

			if (prefersReducedMotion) {
				gsap.set(elements, {
					opacity: 1,
					y: 0,
					scale: 1,
					clearProps: "all",
				});
				return;
			}

			gsap.killTweensOf(elements);

			gsap.fromTo(
				elements,
				{
					opacity: 0,
					y: 16,
					scale: 0.985,
				},
				{
					opacity: 1,
					y: 0,
					scale: 1,
					duration: 0.35,
					stagger: 0.06,
					ease: "power3.out",
					clearProps: "transform,scale",
				}
			);
		},
		{ scope: containerRef, dependencies: [request.id] }
	);

	const { repo, version, changelog, mode } = request.request;
	const isConfirmationRequired = mode === "before";

	const pluginConfigRes = settingsService.getPluginConfiguration(repo);
	const pluginConfig = safe.unwrapOr(pluginConfigRes, null);

	const tokenSecretId = pluginConfig?.tokenSecretId !== false && pluginConfig?.tokenSecretId !== undefined
		? pluginConfig.tokenSecretId
		: undefined;
	const releaseChannel = pluginConfig?.releaseChannel ?? "stable";

	const { data: validationCtx, isLoading: isLoadingManifest } = useRemoteManifest({
		repoUrl: repo,
		version,
		channel: releaseChannel,
		tokenSecretId,
		isEnabled: true,
	});

	const manifest = validationCtx?.manifest;

	const isIncompatible = useMemo((): boolean => {
		if (manifest === undefined) {
			return false;
		}

		const opCtx = createOperationContext({
			repo,
			operationType: "check",
		});

		const compatResult = compatibilityService.checkOverallCompatibility(manifest, opCtx);
		const overall = safe.unwrapOr(compatResult, null);
		if (overall === null) {
			return false;
		}

		return !overall.isCompatible;
	}, [manifest, repo, compatibilityService]);

	const remoteCardData: PluginCardOverrideData = useMemo((): PluginCardOverrideData => {
		if (manifest !== undefined) {
			return {
				name: manifest.name,
				version: manifest.version,
				description: manifest.description,
				author: manifest.author,
				isIncompatible,
			};
		}
		return {
			name: repo.split("/")[1] ?? repo,
			version: version !== "" && version !== "latest" ? version : "Latest",
			description: isLoadingManifest ? "Fetching remote plugin manifest..." : "",
			author: undefined,
			isIncompatible: false,
		};
	}, [manifest, repo, version, isLoadingManifest, isIncompatible]);

	const handleConfirm = useCallback((): void => {
		if (isProcessingRef.current) {
			return;
		}
		isProcessingRef.current = true;
		const resolveRes = safe.try((): void => {
			request.resolve(true);
		});
		if (!resolveRes.ok) {
			console.error("Failed to resolve changelog confirmation request:", resolveRes.error);
		}
		dismissChangelogById(request.id);
	}, [request, dismissChangelogById]);

	const handleCancel = useCallback((): void => {
		if (isProcessingRef.current) {
			return;
		}
		isProcessingRef.current = true;
		const resolveRes = safe.try((): void => {
			request.resolve(false);
		});
		if (!resolveRes.ok) {
			console.error("Failed to resolve changelog cancellation request:", resolveRes.error);
		}
		dismissChangelogById(request.id);
	}, [request, dismissChangelogById]);

	const handleClose = useCallback((): void => {
		if (isProcessingRef.current) {
			return;
		}
		isProcessingRef.current = true;
		const resolveRes = safe.try((): void => {
			request.resolve(true);
		});
		if (!resolveRes.ok) {
			console.error("Failed to resolve changelog dismissal request:", resolveRes.error);
		}
		dismissChangelogById(request.id);
	}, [request, dismissChangelogById]);

	const handlePanelClose = isConfirmationRequired ? handleCancel : handleClose;
	const noopSettings = useCallback((): void => {}, []);

	return (
		<BasePanel centered={false} isOpen onClose={handlePanelClose}>
			<div ref={containerRef} className="ce-changelog-panel-container">
				<div className="ce-dashboard-card-wrapper">
					<CanaryErrorBoundary variant="card">
						<PluginCard
							hideActions
							overrideData={remoteCardData}
							repo={repo}
							onSettings={noopSettings}
						/>
					</CanaryErrorBoundary>
				</div>

				<div className="ce-dashboard-card-wrapper mod-settings-panel">
					<div className="ce-plugin-settings-view">
						<CategorySelector
							activeCategory={activeCategory}
							categories={CHANGELOG_CATEGORIES}
							onCategoryChange={setActiveCategory}
						/>

						<div className="ce-settings-grid">
							{match(activeCategory)
								.with("Changelog", (): JSX.Element => {
									if (changelog.trim() === "") {
										return (
											<StateContainer
												message="No changelog entries provided for this release."
												type="empty"
											/>
										);
									}
									return (
										<div className="ce-readme-tab-container">
											<CanaryErrorBoundary variant="card">
												<MarkdownView markdown={changelog} />
											</CanaryErrorBoundary>
										</div>
									);
								})
								.with("README", (): JSX.Element => (
									<LazyPanelBoundary loadingMessage="Loading plugin README...">
										<LazySharedReadmeTab
											isEnabled={activeCategory === "README"}
											repoUrl={repo}
											tokenSecretId={tokenSecretId}
										/>
									</LazyPanelBoundary>
								))
								.exhaustive()}
						</div>
					</div>
				</div>

				{isConfirmationRequired ? (
					<div className="ce-dashboard-card-wrapper mod-settings-panel">
						<div className="ce-changelog-actions-card">
							<div className="ce-changelog-actions-buttons">
								<Button
									text="Cancel"
									variant="default"
									onClick={handleCancel}
								/>
								<Button
									text="Proceed"
									variant="cta"
									onClick={handleConfirm}
								/>
							</div>
						</div>
					</div>
				) : null}
			</div>
		</BasePanel>
	);
}
