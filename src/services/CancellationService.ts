import { safe } from "@/utils/safe";

import type { Api, Result } from "@/utils/safe";

export class CancellationService {
	private readonly safeCtx = safe.bind(this);
	private readonly activeControllers = new Map<string, AbortController>();
	private readonly activeTypes = new Map<string, string>();
	private disposed = false;

	public getSignal(repo: string, operationType?: string): AbortSignal {
		if (this.disposed === true) {
			throw new Error("CancellationService has been disposed");
		}
		const controller = this.activeControllers.get(repo);
		const existingType = this.activeTypes.get(repo);

		if (controller?.signal.aborted === false) {
			if (operationType !== undefined && existingType === operationType) {
				return controller.signal;
			}
		}

		return this.register(repo, operationType);
	}

	public getSafeContext(repo: string, operationType?: string): Api {
		if (this.disposed === true) {
			throw new Error("CancellationService has been disposed");
		}
		return safe.with({
			signal: this.getSignal(repo, operationType),
		}).bind(this);
	}

	public register(repo: string, operationType?: string): AbortSignal {
		if (this.disposed === true) {
			throw new Error("CancellationService has been disposed");
		}
		const existingController = this.activeControllers.get(repo);
		const existingType = this.activeTypes.get(repo);

		if (existingController?.signal.aborted === false) {
			if (operationType !== undefined && existingType === operationType) {
				return existingController.signal;
			}
			existingController.abort(
				new Error(`Operation superseded by ${operationType ?? "new"} request for repository: ${repo}`),
			);
		}

		const controller = new AbortController();
		this.activeControllers.set(repo, controller);
		if (operationType !== undefined) {
			this.activeTypes.set(repo, operationType);
		} else {
			this.activeTypes.delete(repo);
		}
		return controller.signal;
	}

	public registerSafeContext(repo: string, operationType?: string): Api {
		if (this.disposed === true) {
			throw new Error("CancellationService has been disposed");
		}
		return safe.with({
			signal: this.register(repo, operationType),
		}).bind(this);
	}

	public cancel(repo: string): Result<undefined> {
		return this.safeCtx((): undefined => {
			const controller = this.activeControllers.get(repo);
			if (controller !== undefined) {
				if (controller.signal.aborted === false) {
					controller.abort(new Error(`Operation cancelled for repository: ${repo}`));
				}
				this.activeControllers.delete(repo);
				this.activeTypes.delete(repo);
			}
			return undefined;
		});
	}

	public unregister(repo: string): void {
		this.activeControllers.delete(repo);
		this.activeTypes.delete(repo);
	}

	public hasActive(repo: string): boolean {
		if (this.disposed === true) {
			return false;
		}
		const controller = this.activeControllers.get(repo);
		return controller?.signal.aborted === false;
	}

	public getActiveType(repo: string): string | undefined {
		if (this.disposed === true) {
			return undefined;
		}
		return this.activeTypes.get(repo);
	}

	public cancelAllActiveOperations(): Result<undefined> {
		return this.safeCtx(($): undefined => {
			const keys = Array.from(this.activeControllers.keys());
			for (const repo of keys) {
				$(this.cancel(repo));
			}
			return undefined;
		});
	}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
		for (const controller of this.activeControllers.values()) {
			if (controller.signal.aborted === false) {
				controller.abort(new Error("CancellationService has been disposed"));
			}
		}
		this.activeControllers.clear();
		this.activeTypes.clear();
	}
}
