import { useRef, useCallback, type JSX } from "react";
import { match } from "ts-pattern";

import { BasePanel } from "@/ui/components/BasePanel";
import { Button } from "@/ui/components/BaseComponents";
import { Icon } from "@/ui/components/Icon";
import { useCanaryActions } from "@/ui/hooks/useCanaryStore";
import { useDerivedReset } from "@/ui/hooks/useDerivedReset";

import type { ConfirmRequest } from "@/domain/types";

interface ConfirmPanelProps {
	readonly request: ConfirmRequest;
}

export function ConfirmPanel({ request }: ConfirmPanelProps): JSX.Element {
	const dismissConfirmById = useCanaryActions((actions) => actions.dismissConfirmById);

	const isProcessingRef = useRef<boolean>(false);

	useDerivedReset(request.id, (): void => {
		isProcessingRef.current = false;
	});

	const handleConfirm = useCallback((): void => {
		if (isProcessingRef.current) {
			return;
		}
		isProcessingRef.current = true;
		try {
			request.resolve(true);
		} catch (error: unknown) {
			console.error("Failed to resolve confirmation request:", error);
		}
		dismissConfirmById(request.id);
	}, [request, dismissConfirmById]);

	const handleCancel = useCallback((): void => {
		if (isProcessingRef.current) {
			return;
		}
		isProcessingRef.current = true;
		try {
			request.resolve(false);
		} catch (error: unknown) {
			console.error("Failed to resolve cancellation request:", error);
		}
		dismissConfirmById(request.id);
	}, [request, dismissConfirmById]);

	const { request: overrideRequest } = request;

	const titleText = match(overrideRequest.type)
		.with("resetSettings", (): string => "Reset Settings")
		.with("resetWindowState", (): string => "Reset Window State")
		.with("unregister", (): string => "Unregister Plugin")
		.with("unregisterAndDelete", (): string => "Unregister and Delete")
		.with("appVersion", (): string => "Incompatibility Warning")
		.with("platform", (): string => "Incompatibility Warning")
		.with("register", (): string => "Register Plugin")
		.exhaustive();

	const okText = match(overrideRequest.type)
		.with("resetSettings", (): string => "Reset")
		.with("resetWindowState", (): string => "Reset Window")
		.with("unregister", (): string => "Unregister")
		.with("unregisterAndDelete", (): string => "Delete Permanently")
		.with("appVersion", (): string => "Install anyway")
		.with("platform", (): string => "Install anyway")
		.with("register", (): string => "Register")
		.exhaustive();

	const cancelText = "Cancel";

	const okVariant = match(overrideRequest.type)
		.with("unregisterAndDelete", () => "destructive" as const)
		.with("unregister", () => "warning" as const)
		.with("resetWindowState", () => "warning" as const)
		.otherwise(() => "cta" as const);

	return (
		<BasePanel centered isOpen className="ce-confirm-panel-override" onClose={handleCancel}>
			<div className="ce-dashboard-card-wrapper mod-confirm-panel">
				<div className="ce-confirm-box">
					<div className="ce-confirm-header">
						<div className="ce-confirm-icon-wrapper">
							<Icon className="mod-blue" name="help-circle" />
						</div>
						<div className="ce-confirm-title">
							{titleText}
						</div>
					</div>
					
					<div className="ce-confirm-message">
						{match(overrideRequest)
							.with({ type: "appVersion" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Requires Obsidian </span>
									<code>{r.minVersion}</code>
									<span>, but you have </span>
									<code>{r.currentVersion}</code>
									<span>.</span>
									<br />
									<span>Install anyway?</span>
								</div>
							))
							.with({ type: "platform" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Marked as Desktop Only, but you are on Mobile.</span>
									<br />
									<span>Install anyway?</span>
								</div>
							))
							.with({ type: "resetSettings" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Are you sure you want to reset this plugin's overrides? Visual preferences and customized token pathways will revert to global settings.</span>
								</div>
							))
							.with({ type: "resetWindowState" }, (r) => (
								<div className="ce-confirm-override">
									<span>Target: </span>
									<code>{r.repo}</code>
									<br />
									<span>Are you sure you want to reset the window state and runtime cache? Position, dimensions, and active view state will restore to default.</span>
								</div>
							))
							.with({ type: "unregister" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Are you sure you want to unregister this plugin? It will be removed from Canary Edge indexes, but its files will remain fully intact.</span>
								</div>
							))
							.with({ type: "unregisterAndDelete" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Are you sure you want to delete this plugin? It will be safely disabled and its local files permanently erased from disk.</span>
								</div>
							))
							.with({ type: "register" }, (r) => (
								<div className="ce-confirm-override">
									<span>Plugin: </span>
									<code>{r.repo}</code>
									<br />
									<span>Are you sure you want to register this plugin in Canary Edge?</span>
									{r.channel !== undefined ? (
										<>
											<br />
											<span>Target release channel: </span>
											<code>{r.channel}</code>
										</>
									) : null}
								</div>
							))
							.exhaustive()}
					</div>

					<div className="ce-modal-actions">
						<Button
							text={cancelText}
							variant="default"
							onClick={handleCancel}
						/>
						<Button
							text={okText}
							variant={okVariant}
							onClick={handleConfirm}
						/>
					</div>
				</div>
			</div>
		</BasePanel>
	);
}
