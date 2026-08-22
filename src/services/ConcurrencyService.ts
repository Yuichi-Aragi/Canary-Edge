import { Platform } from "obsidian";
import PQueue from "p-queue";
import { match } from "ts-pattern";
import invariant from "tiny-invariant";

import { isCanaryEdge } from "@/domain/schemas";
import { safe } from "@/utils/safe";

import type { Cradle } from "@/domain/types";
import type { Result } from "@/utils/safe";

export interface ScheduleOptions {
	readonly priority?: number | undefined;
	readonly isBulk?: boolean | undefined;
	readonly signal?: AbortSignal | undefined;
}

interface InternalScheduleTaskParams<T, E> {
	readonly key: string;
	readonly entityName: string;
	readonly queuesMap: Map<string, PQueue>;
	readonly globalQueue: PQueue;
	readonly subQueueConcurrency: number;
	readonly task: () => Promise<Result<T, E>>;
	readonly options?: Readonly<ScheduleOptions> | undefined;
}

export class ConcurrencyService {
	private readonly safeCtx = safe.bind(this);
	private readonly globalRepoQueue: PQueue;
	private readonly repoQueues = new Map<string, PQueue>();
	private readonly globalPluginQueue: PQueue;
	private readonly pluginQueues = new Map<string, PQueue>();
	private readonly globalGitHubQueue: PQueue;
	private readonly gitHubQueues = new Map<string, PQueue>();
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {
		const maxConcurrentRepos = Platform.isMobile ? 2 : 5;
		this.globalRepoQueue = new PQueue({ concurrency: maxConcurrentRepos });
		this.globalPluginQueue = new PQueue({ concurrency: 1 });

		const maxConcurrentGitHub = Platform.isMobile ? 3 : 6;
		this.globalGitHubQueue = new PQueue({ concurrency: maxConcurrentGitHub });
	}

	public async schedule<T, E = Error>(
		repo: string,
		operationType: string,
		task: () => Promise<Result<T, E>>,
		options?: Readonly<ScheduleOptions>,
	): Promise<Result<T, E | Error>> {
		invariant(operationType !== "", "Operation type cannot be empty");
		return this.scheduleTaskInternal({
			key: repo,
			entityName: "repository",
			queuesMap: this.repoQueues,
			globalQueue: this.globalRepoQueue,
			subQueueConcurrency: 1,
			task,
			options,
		});
	}

	public async schedulePlugin<T, E = Error>(
		pluginId: string,
		operationType: string,
		task: () => Promise<Result<T, E>>,
		options?: Readonly<ScheduleOptions>,
	): Promise<Result<T, E | Error>> {
		invariant(operationType !== "", "Operation type cannot be empty");
		return this.scheduleTaskInternal({
			key: pluginId,
			entityName: "plugin",
			queuesMap: this.pluginQueues,
			globalQueue: this.globalPluginQueue,
			subQueueConcurrency: 1,
			task,
			options,
		});
	}

	public async scheduleGitHub<T, E = Error>(
		key: string,
		task: () => Promise<Result<T, E>>,
		options?: Readonly<ScheduleOptions>,
	): Promise<Result<T, E | Error>> {
		return this.scheduleTaskInternal({
			key,
			entityName: "GitHub resource",
			queuesMap: this.gitHubQueues,
			globalQueue: this.globalGitHubQueue,
			subQueueConcurrency: 2,
			task,
			options,
		});
	}

	public async waitForOtherRepoOperations(
		currentRepoOrId: string,
		signal?: AbortSignal,
	): Promise<Result<undefined>> {
		return this.safeCtx.async<undefined>(async ($, defer) => {
			const effectiveSignal = signal ?? this.safeCtx.options.signal;
			const ownManifestId = this.deps.plugin.manifest.id;

			const isSelf = (target: string): boolean => {
				return target === currentRepoOrId || isCanaryEdge(target, ownManifestId);
			};

			this.verifyNotAborted(effectiveSignal, "Canary Edge deferral wait", currentRepoOrId);

			const otherQueues: PQueue[] = [];
			for (const [repoKey, queue] of this.repoQueues.entries()) {
				if (!isSelf(repoKey) && (queue.size > 0 || queue.pending > 0)) {
					otherQueues.push(queue);
				}
			}

			if (otherQueues.length > 0) {
				const idlePromise = Promise.all(
					otherQueues.map(async (q): Promise<void> => {
						await q.onIdle();
					}),
				);

				if (effectiveSignal !== undefined) {
					let abortHandler: (() => void) | undefined;
					const abortPromise = new Promise<never>((_, reject): void => {
						abortHandler = (): void => {
							const reason = effectiveSignal.reason as unknown;
							reject(
								reason instanceof Error
									? reason
									: new Error(`Operation aborted while waiting for other repo operations: ${currentRepoOrId}`),
							);
						};
						effectiveSignal.addEventListener("abort", abortHandler, { once: true });
					});

					defer((): void => {
						if (abortHandler !== undefined) {
							effectiveSignal.removeEventListener("abort", abortHandler);
						}
					});

					await Promise.race([idlePromise, abortPromise]);
				} else {
					await idlePromise;
				}
			}

			if (this.deps.canaryStore.hasPendingOperations(isSelf)) {
				let unsubscribe: (() => void) | undefined;
				let abortHandler: (() => void) | undefined;

				defer((): void => {
					if (unsubscribe !== undefined) {
						unsubscribe();
					}
					if (abortHandler !== undefined && effectiveSignal !== undefined) {
						effectiveSignal.removeEventListener("abort", abortHandler);
					}
				});

				await new Promise<void>((resolve, reject): void => {
					if (effectiveSignal?.aborted === true) {
						const reason = effectiveSignal.reason as unknown;
						reject(
							reason instanceof Error
								? reason
								: new Error("Operation aborted while waiting for other repo operations"),
						);
						return;
					}

					if (!this.deps.canaryStore.hasPendingOperations(isSelf)) {
						resolve();
						return;
					}

					if (effectiveSignal !== undefined) {
						abortHandler = (): void => {
							const reason = effectiveSignal.reason as unknown;
							reject(
								reason instanceof Error
									? reason
									: new Error("Operation aborted while waiting for other repo operations"),
							);
						};
						effectiveSignal.addEventListener("abort", abortHandler, { once: true });
					}

					unsubscribe = this.deps.canaryStore.store.subscribe((): void => {
						if (this.disposed) {
							reject(new Error("ConcurrencyService has been disposed"));
							return;
						}
						if (!this.deps.canaryStore.hasPendingOperations(isSelf)) {
							resolve();
						}
					});
				});
			}

			$.checkpoint();
			return undefined;
		});
	}

	private async scheduleTaskInternal<T, E = Error>(
		params: Readonly<InternalScheduleTaskParams<T, E>>,
	): Promise<Result<T, E | Error>> {
		return this.safeCtx.async<T, E | Error>(async ($, defer) => {
			const { key, entityName, queuesMap, globalQueue, subQueueConcurrency, task, options } = params;

			const identifierLabel = match(entityName)
				.with("GitHub resource", (): string => {
					return "GitHub resource";
				})
				.with("repository", (): string => {
					return "Repository";
				})
				.otherwise((): string => {
					return "Plugin";
				});

			invariant(key !== "", `${identifierLabel} identifier cannot be empty`);

			const effectivePriority = options?.priority ?? (options?.isBulk === true ? 0 : 100);
			const effectiveSignal = options?.signal ?? this.safeCtx.options.signal;

			this.verifyNotAborted(effectiveSignal, entityName, key);

			let subQueue = queuesMap.get(key);
			if (subQueue === undefined) {
				subQueue = new PQueue({ concurrency: subQueueConcurrency });
				queuesMap.set(key, subQueue);
			}

			const targetQueue = subQueue;

			defer((): void => {
				if (targetQueue.size === 0 && targetQueue.pending === 0) {
					queuesMap.delete(key);
				}
			});

			return $(
				await targetQueue.add(
					async (): Promise<Result<T, E | Error>> => {
						this.verifyNotAborted(effectiveSignal, entityName, key);

						return globalQueue.add(
							async (): Promise<Result<T, E | Error>> => {
								this.verifyNotAborted(effectiveSignal, entityName, key);
								if (this.disposed) {
									return safe.err(new Error("ConcurrencyService has been disposed"));
								}
								return task();
							},
							{ priority: effectivePriority, signal: effectiveSignal },
						);
					},
					{ priority: effectivePriority, signal: effectiveSignal },
				),
			);
		});
	}

	private verifyNotAborted(signal: AbortSignal | undefined, entityName: string, key: string): void {
		if (this.disposed) {
			throw new Error("ConcurrencyService has been disposed");
		}
		if (signal?.aborted === true) {
			const reason = signal.reason as unknown;
			throw reason instanceof Error ? reason : new Error(`Operation aborted for ${entityName}: ${key}`);
		}
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;

		this.clearQueueGroup(this.globalRepoQueue, this.repoQueues);
		this.clearQueueGroup(this.globalPluginQueue, this.pluginQueues);
		this.clearQueueGroup(this.globalGitHubQueue, this.gitHubQueues);
	}

	private clearQueueGroup(globalQueue: PQueue, subQueuesMap: Map<string, PQueue>): void {
		globalQueue.pause();
		globalQueue.clear();

		for (const queue of subQueuesMap.values()) {
			queue.pause();
			queue.clear();
		}
		subQueuesMap.clear();
	}
}