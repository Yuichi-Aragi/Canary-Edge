import { createTypedHooks } from "easy-peasy";
import type { CanaryModel } from "@/store/CanaryStore";

const {
	useStoreState,
	useStoreActions,
} = createTypedHooks<CanaryModel>();

export const useCanaryState = useStoreState;

export const useCanaryActions = useStoreActions;
