import { action, createStore } from "easy-peasy";
import { omit } from "es-toolkit";

import { DEFAULT_SETTINGS_VALUES } from "@/domain/schemas";
import { safe } from "@/utils/safe";
import { scrubRepositoryUrl } from "@/utils/stringUtils";

import type { Action, State, Store } from "easy-peasy";
import type {
	ActivePrompt,
	ChangelogProceedRequest,
	ChangelogRequest,
	ConfirmRequest,
	DashboardFilterType,
	DetectedUpdate,
	InstallPluginModalOptions,
	OperationState,
	OverrideRequest,
	RateLimitData,
	Settings,
} from "@/domain/types";

export const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

function isSameOverrideRequest(a: Readonly<OverrideRequest>, b: Readonly<OverrideRequest>): boolean {
	return a.type === b.type && a.repo === b.repo;
}

function isSameChangelogRequest(a: Readonly<ChangelogProceedRequest>, b: Readonly<ChangelogProceedRequest>): boolean {
	return a.repo === b.repo && a.version === b.version && a.mode === b.mode;
}

function syncPromptState(state: State<CanaryModel>, queue: readonly ActivePrompt[]): void {
	const active = queue[0] ?? null;
	state.ui.promptQueue = queue;
	state.ui.activePrompt = active;
	state.ui.confirmRequest = active?.kind === "confirm" ? active.request : null;
	state.ui.changelogRequest = active?.kind === "changelog" ? active.request : null;
	state.ui.confirmQueue = queue
		.filter((item): item is { readonly kind: "confirm"; readonly request: ConfirmRequest } => {
			return item.kind === "confirm";
		})
		.map((item) => {
			return item.request;
		});
	state.ui.changelogQueue = queue
		.filter((item): item is { readonly kind: "changelog"; readonly request: ChangelogRequest } => {
			return item.kind === "changelog";
		})
		.map((item) => {
			return item.request;
		});
}

function chainPromptResolvers(
	originalResolve: (value: boolean) => void,
	newResolve: (value: boolean) => void,
): (value: boolean) => void {
	return (value: boolean): void => {
		const res = safe((_$, defer): void => {
			defer((): void => {
				newResolve(value);
			});
			originalResolve(value);
		});
		if (res.ok === false) {
			console.error("Error executing chained prompt resolve callback:", res.error);
		}
	};
}

function safelyResolvePrompts(prompts: readonly ActivePrompt[], value = false): void {
	for (const item of prompts) {
		const resolveRes = safe.try((): void => {
			item.request.resolve(value);
		});
		if (resolveRes.ok === false) {
			console.error("Error resolving prompt callback:", resolveRes.error);
		}
	}
}

function removePromptById(state: State<CanaryModel>, id: string): void {
	const nextQueue = state.ui.promptQueue.filter((item): boolean => {
		return item.request.id !== id;
	});
	syncPromptState(state, nextQueue);
}

function handleEnqueuePrompt<K extends "confirm" | "changelog">(
	state: State<CanaryModel>,
	kind: K,
	payload: (K extends "confirm" ? ConfirmRequest : ChangelogRequest) | null,
	isMatch: (
		a: K extends "confirm" ? OverrideRequest : ChangelogProceedRequest,
		b: K extends "confirm" ? OverrideRequest : ChangelogProceedRequest,
	) => boolean,
): void {
	if (payload === null) {
		if (state.ui.promptQueue.length > 0 && state.ui.promptQueue[0]?.kind === kind) {
			syncPromptState(state, state.ui.promptQueue.slice(1));
		}
		return;
	}

	const existingIndex = state.ui.promptQueue.findIndex((item): boolean => {
		if (item.kind !== kind) {
			return false;
		}
		return isMatch(
			item.request.request as K extends "confirm" ? OverrideRequest : ChangelogProceedRequest,
			payload.request as K extends "confirm" ? OverrideRequest : ChangelogProceedRequest,
		);
	});

	if (existingIndex !== -1) {
		const existingItem = state.ui.promptQueue[existingIndex];
		if (existingItem?.kind === kind) {
			const chainedResolve = chainPromptResolvers(existingItem.request.resolve, payload.resolve);

			let updatedItem: ActivePrompt;
			if (kind === "confirm") {
				const confirmRequest = existingItem.request as ConfirmRequest;
				updatedItem = {
					kind: "confirm",
					request: {
						...confirmRequest,
						resolve: chainedResolve,
					},
				};
			} else {
				const changelogRequest = existingItem.request as ChangelogRequest;
				updatedItem = {
					kind: "changelog",
					request: {
						...changelogRequest,
						resolve: chainedResolve,
					},
				};
			}

			const updatedQueue = [...state.ui.promptQueue];
			updatedQueue[existingIndex] = updatedItem;
			syncPromptState(state, updatedQueue);
			return;
		}
	}

	if (kind === "confirm") {
		state.ui.installPluginRequest = null;
		const newPrompt: ActivePrompt = {
			kind: "confirm",
			request: payload as ConfirmRequest,
		};
		syncPromptState(state, [...state.ui.promptQueue, newPrompt]);
	} else {
		const newPrompt: ActivePrompt = {
			kind: "changelog",
			request: payload as ChangelogRequest,
		};
		syncPromptState(state, [...state.ui.promptQueue, newPrompt]);
	}
}

export interface CanaryModel {
	settings: Settings;
	runtime: {
		rateLimitCache: Record<string, RateLimitData>;
		operations: Record<string, OperationState>;
		dismissedInstallations: Record<string, { readonly version: string; readonly dismissedAt: number }>;
		dismissedOperationIds: Record<string, boolean>;
		detectedUpdates: Record<string, readonly DetectedUpdate[]>;
	};
	ui: {
		isCEWindowOpen: boolean;
		installPluginRequest: InstallPluginModalOptions | null;
		activePrompt: ActivePrompt | null;
		promptQueue: readonly ActivePrompt[];
		confirmRequest: ConfirmRequest | null;
		confirmQueue: readonly ConfirmRequest[];
		changelogRequest: ChangelogRequest | null;
		changelogQueue: readonly ChangelogRequest[];
		activeDashboardFilters: readonly DashboardFilterType[];
	};

	setSettings: Action<CanaryModel, Settings>;
	updateRateLimit: Action<CanaryModel, { readonly tokenKey: string; readonly data: RateLimitData }>;
	updateOperationState: Action<CanaryModel, { readonly repo: string; readonly operation: OperationState | null }>;
	setCEWindowVisibility: Action<CanaryModel, boolean>;
	requestInstallPlugin: Action<CanaryModel, InstallPluginModalOptions | null>;
	requestConfirm: Action<CanaryModel, ConfirmRequest | null>;
	dismissConfirmById: Action<CanaryModel, string>;
	requestChangelog: Action<CanaryModel, ChangelogRequest | null>;
	dismissChangelogById: Action<CanaryModel, string>;
	dismissPromptById: Action<CanaryModel, string>;
	dismissPromptsForRepo: Action<CanaryModel, string>;
	dismissAllPrompts: Action<CanaryModel>;
	dismissInstallation: Action<
		CanaryModel,
		{ readonly repo: string; readonly version: string; readonly dismissedAt: number }
	>;
	dismissOperationId: Action<CanaryModel, string>;
	addDetectedUpdate: Action<CanaryModel, DetectedUpdate>;
	clearDetectedUpdates: Action<CanaryModel, string>;
	clearAllDetectedUpdates: Action<CanaryModel>;
	dismissDetectedUpdate: Action<CanaryModel, { readonly repo: string; readonly id: string }>;
	setActiveDashboardFilters: Action<CanaryModel, readonly DashboardFilterType[]>;
	toggleDashboardFilter: Action<CanaryModel, DashboardFilterType>;
	clearDashboardFilters: Action<CanaryModel>;
	resetRuntime: Action<CanaryModel>;
}

export class CanaryStore {
	public readonly store: Store<CanaryModel>;

	public constructor() {
		this.store = createStore<CanaryModel>({
			settings: DEFAULT_SETTINGS_VALUES,
			runtime: {
				rateLimitCache: {},
				operations: {},
				dismissedInstallations: {},
				dismissedOperationIds: {},
				detectedUpdates: {},
			},
			ui: {
				isCEWindowOpen: false,
				installPluginRequest: null,
				activePrompt: null,
				promptQueue: [],
				confirmRequest: null,
				confirmQueue: [],
				changelogRequest: null,
				changelogQueue: [],
				activeDashboardFilters: [],
			},

			setSettings: action((state, payload): void => {
				state.settings = payload;
			}),

			updateRateLimit: action((state, payload): void => {
				const existing = state.runtime.rateLimitCache[payload.tokenKey];
				if (existing === undefined || payload.data.timestamp >= existing.timestamp) {
					state.runtime.rateLimitCache[payload.tokenKey] = payload.data;
				}
			}),

			updateOperationState: action((state, payload): void => {
				const { repo, operation } = payload;
				if (operation === null) {
					state.runtime.operations = omit(state.runtime.operations, [repo]);
				} else {
					state.runtime.operations[repo] = operation;
				}
			}),

			setCEWindowVisibility: action((state, payload): void => {
				state.ui.isCEWindowOpen = payload;
			}),

			requestInstallPlugin: action((state, payload): void => {
				state.ui.installPluginRequest = payload;
			}),

			requestConfirm: action((state, payload): void => {
				handleEnqueuePrompt(state, "confirm", payload, isSameOverrideRequest);
			}),

			dismissConfirmById: action((state, payload): void => {
				removePromptById(state, payload);
			}),

			requestChangelog: action((state, payload): void => {
				handleEnqueuePrompt(state, "changelog", payload, isSameChangelogRequest);
			}),

			dismissChangelogById: action((state, payload): void => {
				removePromptById(state, payload);
			}),

			dismissPromptById: action((state, payload): void => {
				removePromptById(state, payload);
			}),

			dismissPromptsForRepo: action((state, payload): void => {
				const scrubbedRepo = scrubRepositoryUrl(payload);
				const remainingQueue: ActivePrompt[] = [];
				const dismissedPrompts: ActivePrompt[] = [];

				for (const item of state.ui.promptQueue) {
					const itemRepo = scrubRepositoryUrl(item.request.request.repo);
					if (itemRepo === scrubbedRepo) {
						dismissedPrompts.push(item);
					} else {
						remainingQueue.push(item);
					}
				}

				if (dismissedPrompts.length > 0) {
					safelyResolvePrompts(dismissedPrompts, false);
					syncPromptState(state, remainingQueue);
				}
			}),

			dismissAllPrompts: action((state): void => {
				safelyResolvePrompts(state.ui.promptQueue, false);
				syncPromptState(state, []);
			}),

			dismissInstallation: action((state, payload): void => {
				const { repo, version, dismissedAt } = payload;
				state.runtime.dismissedInstallations[repo] = { version, dismissedAt };
			}),

			dismissOperationId: action((state, payload): void => {
				state.runtime.dismissedOperationIds[payload] = true;
			}),

			addDetectedUpdate: action((state, payload): void => {
				const { repo, version } = payload;
				const existing = state.runtime.detectedUpdates[repo] ?? EMPTY_ARRAY;
				const duplicateIndex = existing.findIndex((item): boolean => {
					return item.version === version;
				});

				if (duplicateIndex !== -1) {
					const updated = [...existing];
					updated[duplicateIndex] = payload;
					state.runtime.detectedUpdates[repo] = updated;
				} else {
					state.runtime.detectedUpdates[repo] = [...existing, payload];
				}
			}),

			clearDetectedUpdates: action((state, payload): void => {
				state.runtime.detectedUpdates = omit(state.runtime.detectedUpdates, [payload]);
			}),

			clearAllDetectedUpdates: action((state): void => {
				state.runtime.detectedUpdates = {};
			}),

			dismissDetectedUpdate: action((state, payload): void => {
				const { repo, id } = payload;
				const existing = state.runtime.detectedUpdates[repo];
				if (existing !== undefined) {
					const filtered = existing.filter((item): boolean => {
						return item.id !== id;
					});
					if (filtered.length === 0) {
						state.runtime.detectedUpdates = omit(state.runtime.detectedUpdates, [repo]);
					} else {
						state.runtime.detectedUpdates[repo] = filtered;
					}
				}
			}),

			setActiveDashboardFilters: action((state, payload): void => {
				state.ui.activeDashboardFilters = payload;
			}),

			toggleDashboardFilter: action((state, payload): void => {
				const current = state.ui.activeDashboardFilters;
				if (payload === "installing") {
					if (current.includes("installing") === true) {
						state.ui.activeDashboardFilters = current.filter((f): boolean => {
							return f !== "installing";
						});
					} else {
						state.ui.activeDashboardFilters = ["installing"];
					}
					return;
				}

				if (payload === "untracked") {
					if (current.includes("untracked") === true) {
						state.ui.activeDashboardFilters = current.filter((f): boolean => {
							return f !== "untracked";
						});
					} else {
						state.ui.activeDashboardFilters = ["untracked"];
					}
					return;
				}

				const withoutExclusive = current.filter((f): boolean => {
					return f !== "installing" && f !== "untracked";
				});

				if (withoutExclusive.includes(payload) === true) {
					state.ui.activeDashboardFilters = withoutExclusive.filter((f): boolean => {
						return f !== payload;
					});
				} else {
					state.ui.activeDashboardFilters = [...withoutExclusive, payload];
				}
			}),

			clearDashboardFilters: action((state): void => {
				state.ui.activeDashboardFilters = [];
			}),

			resetRuntime: action((state): void => {
				safelyResolvePrompts(state.ui.promptQueue, false);
				state.runtime = {
					rateLimitCache: {},
					operations: {},
					dismissedInstallations: {},
					dismissedOperationIds: {},
					detectedUpdates: {},
				};
				state.ui = {
					isCEWindowOpen: false,
					installPluginRequest: null,
					activePrompt: null,
					promptQueue: [],
					confirmRequest: null,
					confirmQueue: [],
					changelogRequest: null,
					changelogQueue: [],
					activeDashboardFilters: [],
				};
			}),
		});
	}

	public setSettings(settings: Readonly<Settings>): void {
		this.store.getActions().setSettings(settings);
	}

	public updateRateLimit(tokenKey: string, data: Readonly<RateLimitData>): void {
		this.store.getActions().updateRateLimit({ tokenKey, data });
	}

	public updateOperationState(repo: string, operation: Readonly<OperationState> | null): void {
		this.store.getActions().updateOperationState({ repo, operation });
	}

	public setCEWindowVisibility(isOpen: boolean): void {
		this.store.getActions().setCEWindowVisibility(isOpen);
	}

	public requestInstallPlugin(request: Readonly<InstallPluginModalOptions> | null): void {
		this.store.getActions().requestInstallPlugin(request);
	}

	public requestConfirm(request: Readonly<ConfirmRequest> | null): void {
		this.store.getActions().requestConfirm(request);
	}

	public dismissConfirmById(id: string): void {
		this.store.getActions().dismissConfirmById(id);
	}

	public requestChangelog(request: Readonly<ChangelogRequest> | null): void {
		this.store.getActions().requestChangelog(request);
	}

	public dismissChangelogById(id: string): void {
		this.store.getActions().dismissChangelogById(id);
	}

	public dismissPromptById(id: string): void {
		this.store.getActions().dismissPromptById(id);
	}

	public dismissPromptsForRepo(repo: string): void {
		this.store.getActions().dismissPromptsForRepo(repo);
	}

	public dismissAllPrompts(): void {
		this.store.getActions().dismissAllPrompts();
	}

	public dismissInstallation(repo: string, version: string, dismissedAt: number): void {
		this.store.getActions().dismissInstallation({ repo, version, dismissedAt });
	}

	public dismissOperationId(id: string): void {
		this.store.getActions().dismissOperationId(id);
	}

	public addDetectedUpdate(update: Readonly<DetectedUpdate>): void {
		this.store.getActions().addDetectedUpdate(update);
	}

	public clearDetectedUpdates(repo: string): void {
		this.store.getActions().clearDetectedUpdates(repo);
	}

	public clearAllDetectedUpdates(): void {
		this.store.getActions().clearAllDetectedUpdates();
	}

	public dismissDetectedUpdate(repo: string, id: string): void {
		this.store.getActions().dismissDetectedUpdate({ repo, id });
	}

	public setActiveDashboardFilters(filters: readonly DashboardFilterType[]): void {
		this.store.getActions().setActiveDashboardFilters(filters);
	}

	public toggleDashboardFilter(filter: DashboardFilterType): void {
		this.store.getActions().toggleDashboardFilter(filter);
	}

	public clearDashboardFilters(): void {
		this.store.getActions().clearDashboardFilters();
	}

	public dispose(): void {
		const actions = this.store.getActions();
		actions.resetRuntime();
		actions.setSettings(DEFAULT_SETTINGS_VALUES);
	}

	public getSettings(): Settings {
		return this.store.getState().settings;
	}

	public getIsCEWindowOpen(): boolean {
		return this.store.getState().ui.isCEWindowOpen;
	}

	public getOperationState(repo: string): OperationState | undefined {
		return this.store.getState().runtime.operations[repo];
	}

	public getDetectedUpdates(repo: string): readonly DetectedUpdate[] {
		return this.store.getState().runtime.detectedUpdates[repo] ?? EMPTY_ARRAY;
	}

	public getAllDetectedUpdates(): Record<string, readonly DetectedUpdate[]> {
		return this.store.getState().runtime.detectedUpdates;
	}

	public getDismissedOperationIds(): Record<string, boolean> {
		return this.store.getState().runtime.dismissedOperationIds;
	}

	public getActivePrompt(): ActivePrompt | null {
		return this.store.getState().ui.activePrompt;
	}

	public getPromptQueue(): readonly ActivePrompt[] {
		return this.store.getState().ui.promptQueue;
	}

	public getActiveDashboardFilters(): readonly DashboardFilterType[] {
		return this.store.getState().ui.activeDashboardFilters;
	}

	public hasPendingOperations(excludePredicate?: (repo: string) => boolean): boolean {
		const { operations } = this.store.getState().runtime;
		for (const repo of Object.keys(operations)) {
			const op = operations[repo];
			if (op?.status === "pending") {
				if (excludePredicate?.(repo) === true) {
					continue;
				}
				return true;
			}
		}
		return false;
	}
}

export type CanaryState = State<CanaryModel>;
