import { useMutation } from "@tanstack/react-query";

import { safe } from "@/utils/safe";
import { useService } from "@/ui/hooks/useService";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Settings } from "@/domain/types";
import type { Draft } from "mutative";

export interface UpdateSettingsParams {
	readonly recipe: (draft: Draft<Settings>) => void;
	readonly expectedVersion: number;
}

export function useSettingsMutations(): {
	readonly updateSettings: UseMutationResult<void, Error, UpdateSettingsParams>;
} {
	const settingsService = useService("settingsService");

	const updateSettingsMutation = useMutation({
		mutationFn: async (params: UpdateSettingsParams): Promise<void> => {
			safe.unwrap(await settingsService.updateSettings(params.recipe, params.expectedVersion));
		},
		retry: 0,
	});

	return {
		updateSettings: updateSettingsMutation,
	};
}
