import { useMemo, useCallback } from "react";
import { useMutationState } from "@tanstack/react-query";
import { groupBy } from "es-toolkit";

import { useCanaryState, useCanaryActions } from "@/ui/hooks/useCanaryStore";

import type { Mutation, MutationState } from "@tanstack/react-query";
import type { InstallPluginParams } from "@/ui/hooks/usePluginOperations";

export interface ActiveInstallOperation {
	readonly id: string;
	readonly repo: string;
	readonly version: string;
	readonly status: "pending" | "error";
	readonly error: Error | null;
	readonly submittedAt: number;
	readonly variables: InstallPluginParams;
}

export interface UseMutationTrackerResult {
	readonly activeInstallations: readonly ActiveInstallOperation[];
	readonly activeInstallationsMap: ReadonlyMap<string, ActiveInstallOperation>;
	readonly hasActiveInstallations: boolean;
	readonly dismissMutation: (id: string) => void;
}

const SESSION_START_TIME = Date.now();

export function useMutationTracker(): UseMutationTrackerResult {
	const dismissedOperationIds = useCanaryState((state) => {
		return state.runtime.dismissedOperationIds;
	});
	const dismissedInstallations = useCanaryState((state) => {
		return state.runtime.dismissedInstallations;
	});

	const dismissOperationIdAction = useCanaryActions((actions) => {
		return actions.dismissOperationId;
	});
	const dismissInstallation = useCanaryActions((actions) => {
		return actions.dismissInstallation;
	});

	const installMutations = useMutationState({
		filters: { mutationKey: ["plugin", "install"] },
		select: (mutation: Mutation): MutationState => {
			return mutation.state;
		},
	});

	const activeInstallations = useMemo((): readonly ActiveInstallOperation[] => {
		const grouped = groupBy(installMutations, (m: MutationState): string => {
			const variables = m.variables as InstallPluginParams | undefined;
			return variables?.repo ?? "unknown";
		});

		const latestMutations = Object.values(grouped).map((group: MutationState[]): MutationState => {
			return group.reduce((latest: MutationState, current: MutationState): MutationState => {
				return current.submittedAt > latest.submittedAt ? current : latest;
			});
		});

		const filtered = latestMutations.filter((m: MutationState): boolean => {
			const variables = m.variables as InstallPluginParams | undefined;
			if (variables === undefined) {
				return false;
			}
			const { repo, version } = variables;
			if (repo === "") {
				return false;
			}

			if (m.status === "success") {
				return false;
			}

			const targetVersion = version !== "" ? version : "latest";
			const opId = `${repo}:${String(m.submittedAt)}`;

			if (Boolean(dismissedOperationIds[opId]) === true) {
				return false;
			}

			const dismissalRecord = dismissedInstallations[repo];
			if (dismissalRecord?.version === targetVersion) {
				if (m.submittedAt <= dismissalRecord.dismissedAt) {
					return false;
				}
			}

			if (m.status === "error" && m.submittedAt < SESSION_START_TIME) {
				return false;
			}

			return true;
		});

		return filtered.map((m: MutationState): ActiveInstallOperation => {
			const vars = (m.variables as InstallPluginParams | undefined) ?? {
				repo: "unknown",
				version: "latest",
				isFrozen: false,
				enableAfterInstall: false,
			};
			const { repo } = vars;
			const opId = `${repo}:${String(m.submittedAt)}`;

			let normalizedError: Error | null = null;
			if (m.error instanceof Error) {
				normalizedError = m.error;
			} else if (m.error !== null && m.error !== undefined) {
				normalizedError = new Error(String(m.error));
			}

			const normalizedStatus: "pending" | "error" = m.status === "error" ? "error" : "pending";

			return {
				id: opId,
				repo,
				version: vars.version !== "" ? vars.version : "latest",
				status: normalizedStatus,
				error: normalizedError,
				submittedAt: m.submittedAt,
				variables: vars,
			};
		});
	}, [installMutations, dismissedOperationIds, dismissedInstallations]);

	const activeInstallationsMap = useMemo((): ReadonlyMap<string, ActiveInstallOperation> => {
		const map = new Map<string, ActiveInstallOperation>();
		for (const installOp of activeInstallations) {
			map.set(installOp.repo, installOp);
		}
		return map;
	}, [activeInstallations]);

	const dismissMutation = useCallback((id: string): void => {
		dismissOperationIdAction(id);

		const operation = activeInstallations.find((op: ActiveInstallOperation): boolean => {
			return op.id === id;
		});

		if (operation === undefined) {
			return;
		}

		dismissInstallation({
			repo: operation.repo,
			version: operation.version,
			dismissedAt: operation.submittedAt,
		});
	}, [dismissOperationIdAction, activeInstallations, dismissInstallation]);

	return {
		activeInstallations,
		activeInstallationsMap,
		hasActiveInstallations: activeInstallations.length > 0,
		dismissMutation,
	};
}
