import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createElement } from "react";
import type CanaryEdgePlugin from "@/main";
import { safe } from "@/utils/safe";

export class CEWindowManager {
	private root: Root | null = null;
	private containerEl: HTMLElement | null = null;
	private activeToken = 0;

	public async open(plugin: CanaryEdgePlugin): Promise<void> {
		if (this.root !== null) {
			return;
		}

		const currentToken = ++this.activeToken;
		const targetDocument = typeof activeDocument !== "undefined" ? activeDocument : activeWindow.document;

		let container: HTMLElement | null = null;
		let localRoot: Root | null = null;

		try {
			container = targetDocument.body.createDiv("ce-ce-window-root");
			localRoot = createRoot(container);

			this.containerEl = container;
			this.root = localRoot;

			const { CEWindow } = await import("@/ui/windows/CEWindow");

			if (this.activeToken !== currentToken) {
				this.destroyNode(localRoot, container);
				return;
			}

			if (this.root !== localRoot || this.containerEl !== container) {
				this.destroyNode(localRoot, container);
				return;
			}

			localRoot.render(
				createElement(CEWindow, {
					plugin,
					onClose: (): void => {
						this.close();
					},
				})
			);
		} catch (error: unknown) {
			if (this.activeToken === currentToken) {
				this.close();
			} else {
				this.destroyNode(localRoot, container);
			}

			const normalizedError =
				error instanceof Error
					? error
					: new Error(typeof error === "string" ? error : String(error));
			throw normalizedError;
		}
	}

	public close(): void {
		this.activeToken++;

		const rootToUnmount = this.root;
		const containerToRemove = this.containerEl;

		this.root = null;
		this.containerEl = null;

		this.destroyNode(rootToUnmount, containerToRemove);
	}

	public toggle(plugin: CanaryEdgePlugin): void {
		if (this.root !== null) {
			this.close();
		} else {
			void this.open(plugin);
		}
	}

	public dispose(): void {
		this.close();
	}

	private destroyNode(rootToUnmount: Root | null, containerToRemove: HTMLElement | null): void {
		safe((_$, defer): void => {
			defer((): void => {
				if (containerToRemove !== null) {
					containerToRemove.remove();
				}
			});

			if (rootToUnmount !== null) {
				rootToUnmount.unmount();
			}
		});
	}
}
