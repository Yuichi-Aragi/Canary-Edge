import { getFriendlyErrorMessage } from "@/domain/errorMessages";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Cradle, OperationGuard, OperationState, OperationType } from "@/domain/types";
import type { Result } from "@/utils/safe";

export type { OperationGuard };

export class OperationTrackingService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	private setTrackingState(
		repo: string,
		state: Readonly<OperationState> | null,
		dismissPrompts = false,
	): Result<undefined> {
		return this.safeCtx(($): undefined => {
			const scrubbed = scrubRepositoryUrl(repo);
			this.deps.canaryStore.updateOperationState(scrubbed, state);
			if (dismissPrompts === true) {
				$(this.deps.uiService.dismissPromptsForRepo(scrubbed));
			}
			return undefined;
		});
	}

	public start(repo: string, type: OperationType, initialMessage = "Initializing..."): Result<undefined> {
		const scrubbed = scrubRepositoryUrl(repo);
		console.info(`[Canary-Edge] [OperationTracking] [${scrubbed}] Operation started (${type}): ${initialMessage}`);
		return this.setTrackingState(scrubbed, {
			type,
			step: "Initialization",
			message: initialMessage,
			status: "pending",
			timestamp: Date.now(),
		});
	}

	public update(repo: string, step: string, message: string): Result<undefined> {
		const scrubbed = scrubRepositoryUrl(repo);
		const current = this.deps.canaryStore.getOperationState(scrubbed);
		console.info(`[Canary-Edge] [OperationTracking] [${scrubbed}] Telemetry update [${step}]: ${message}`);

		return this.setTrackingState(scrubbed, {
			type: current?.type ?? "check",
			step,
			message,
			status: "pending",
			timestamp: Date.now(),
		});
	}

	public complete(repo: string, finalMessage = "Completed successfully"): Result<undefined> {
		const scrubbed = scrubRepositoryUrl(repo);
		const current = this.deps.canaryStore.getOperationState(scrubbed);
		console.info(`[Canary-Edge] [OperationTracking] [${scrubbed}] Operation completed: ${finalMessage}`);

		return this.setTrackingState(
			scrubbed,
			{
				type: current?.type ?? "check",
				step: "Finished",
				message: finalMessage,
				status: "success",
				timestamp: Date.now(),
			},
			true,
		);
	}

	public fail(repo: string, error: unknown): Result<undefined> {
		const scrubbed = scrubRepositoryUrl(repo);
		const current = this.deps.canaryStore.getOperationState(scrubbed);
		console.error(`[Canary-Edge] [OperationTracking] [${scrubbed}] Operation failed:`, error);

		const friendlyErrorMessage = this.formatErrorMessage(error);

		return this.setTrackingState(
			scrubbed,
			{
				type: current?.type ?? "check",
				step: "Error",
				message: friendlyErrorMessage.length > 0 ? friendlyErrorMessage : "Operation failed",
				status: "error",
				timestamp: Date.now(),
				error: friendlyErrorMessage,
			},
			true,
		);
	}

	public clear(repo: string): Result<undefined> {
		const scrubbed = scrubRepositoryUrl(repo);
		console.info(`[Canary-Edge] [OperationTracking] [${scrubbed}] Operation state cleared.`);
		return this.setTrackingState(scrubbed, null, true);
	}

	private formatErrorMessage(error: unknown): string {
		return getFriendlyErrorMessage(error);
	}

	public createScopeGuard(
		repo: string,
		type: OperationType,
		defaultFailureMessage: string,
		manageCancellation = true,
	): OperationGuard {
		const scrubbed = scrubRepositoryUrl(repo);
		this.start(scrubbed, type);

		return {
			update: (step: string, message: string): Result<undefined> => {
				return this.update(scrubbed, step, message);
			},
			complete: (finalMessage = "Completed successfully"): Result<undefined> => {
				return this.complete(scrubbed, finalMessage);
			},
			fail: (error: unknown): Result<undefined> => {
				return this.fail(scrubbed, error);
			},
			cleanup: (taskSucceeded: boolean, fallbackErrorMessage?: string): void => {
				if (taskSucceeded === false) {
					const current = this.deps.canaryStore.getOperationState(scrubbed);
					if (current?.status !== "error") {
						const msg = fallbackErrorMessage ?? defaultFailureMessage;
						this.fail(scrubbed, new Error(msg));
					}
					if (manageCancellation === true) {
						this.deps.cancellationService.cancel(scrubbed);
					}
				} else if (manageCancellation === true) {
					this.deps.cancellationService.unregister(scrubbed);
				}
			},
		};
	}
}
