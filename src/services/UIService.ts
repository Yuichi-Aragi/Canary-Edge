import { v4 as uuidv4 } from "uuid";

import { createAbortListener } from "@/utils/contextUtils";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { ChangelogProceedRequest, Cradle, InstallPluginModalOptions, OverrideRequest } from "@/domain/types";
import type { Result } from "@/utils/safe";

interface PendingPromptRecord {
	readonly repo: string;
	readonly resolve: (value: boolean) => void;
}

const isSignalAborted = (signal?: AbortSignal): boolean => {
	return signal?.aborted === true;
};

export class UIService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;
	private readonly pendingPrompts = new Map<string, PendingPromptRecord>();

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;

		for (const [id, record] of this.pendingPrompts.entries()) {
			const resolveRes = safe.try((): void => {
				record.resolve(false);
			});
			if (resolveRes.ok === false) {
				console.error("Error clearing pending prompt on dispose:", resolveRes.error);
			}
			this.deps.canaryStore.dismissPromptById(id);
		}
		this.pendingPrompts.clear();
		this.deps.canaryStore.dismissAllPrompts();
	}

	public displayInstallNewPluginModal(options: Readonly<InstallPluginModalOptions>): Result<undefined> {
		return this.safeCtx((): undefined => {
			const scrubbedPrefill = scrubRepositoryUrl(options.prefillRepo ?? "");

			this.deps.canaryStore.requestInstallPlugin({
				...options,
				prefillRepo: scrubbedPrefill,
			});

			void this.deps.ceWindowManager.open(this.deps.plugin);
			return undefined;
		});
	}

	public dismissPromptsForRepo(repo: string): Result<undefined> {
		return this.safeCtx((): undefined => {
			const scrubbed = scrubRepositoryUrl(repo);
			for (const [id, record] of this.pendingPrompts.entries()) {
				if (record.repo === scrubbed) {
					const resolveRes = safe.try((): void => {
						record.resolve(false);
					});
					if (resolveRes.ok === false) {
						console.error(`Error clearing pending prompt for ${scrubbed}:`, resolveRes.error);
					}
					this.deps.canaryStore.dismissPromptById(id);
					this.pendingPrompts.delete(id);
				}
			}
			this.deps.canaryStore.dismissPromptsForRepo(scrubbed);
			return undefined;
		});
	}

	public async confirmOverride(request: Readonly<OverrideRequest>): Promise<Result<boolean>> {
		return await this.promptConfirmation<OverrideRequest>(
			request,
			(payload): void => {
				this.deps.canaryStore.requestConfirm(payload);
			},
			"Override prompt aborted",
		);
	}

	public async confirmChangelog(request: Readonly<ChangelogProceedRequest>): Promise<Result<boolean>> {
		return await this.promptConfirmation<ChangelogProceedRequest>(
			request,
			(payload): void => {
				this.deps.canaryStore.requestChangelog(payload);
			},
			"Changelog proceed prompt aborted",
		);
	}

	public async displayChangelog(request: Readonly<ChangelogProceedRequest>): Promise<Result<boolean>> {
		return await this.promptConfirmation<ChangelogProceedRequest>(
			request,
			(payload): void => {
				this.deps.canaryStore.requestChangelog(payload);
			},
			"Changelog display prompt aborted",
		);
	}

	private async promptConfirmation<TRequest extends { readonly repo: string }>(
		request: Readonly<TRequest>,
		requestStoreFn: (payload: {
			readonly id: string;
			readonly request: Readonly<TRequest>;
			readonly resolve: (value: boolean) => void;
		}) => void,
		abortedErrorMessage: string,
	): Promise<Result<boolean>> {
		return await this.safeCtx.async<boolean>(async (_$, defer) => {
			void this.deps.ceWindowManager.open(this.deps.plugin);

			const uniqueId = uuidv4();
			const scrubbedRepo = scrubRepositoryUrl(request.repo);
			const { signal } = this.safeCtx.options;

			let cleanupAbortListener: (() => void) | undefined;

			defer((): void => {
				this.pendingPrompts.delete(uniqueId);
				this.deps.canaryStore.dismissPromptById(uniqueId);
				if (cleanupAbortListener !== undefined) {
					cleanupAbortListener();
				}
			});

			if (isSignalAborted(signal) === true) {
				const reason = signal?.reason as unknown;
				throw reason instanceof Error ? reason : new Error(abortedErrorMessage);
			}

			const confirmed = await new Promise<boolean>((resolve): void => {
				this.pendingPrompts.set(uniqueId, { repo: scrubbedRepo, resolve });

				cleanupAbortListener = createAbortListener(signal, (): void => {
					if (this.pendingPrompts.has(uniqueId) === true) {
						this.pendingPrompts.delete(uniqueId);
						this.deps.canaryStore.dismissPromptById(uniqueId);
						resolve(false);
					}
				});

				requestStoreFn({
					id: uniqueId,
					request,
					resolve: (value: boolean): void => {
						if (cleanupAbortListener !== undefined) {
							cleanupAbortListener();
						}
						this.pendingPrompts.delete(uniqueId);
						resolve(value);
					},
				});
			});

			if (isSignalAborted(signal) === true) {
				const reason = signal?.reason as unknown;
				throw reason instanceof Error ? reason : new Error(abortedErrorMessage);
			}

			return confirmed;
		});
	}
}
