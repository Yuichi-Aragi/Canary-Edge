import { useState, useMemo, useCallback } from "react";

export interface UseBooleanActions {
	readonly set: (value: boolean) => void;
	readonly setTrue: () => void;
	readonly setFalse: () => void;
	readonly toggle: () => void;
}

export function useBoolean(defaultValue = false): readonly [boolean, UseBooleanActions] {
	const [state, setState] = useState<boolean>(Boolean(defaultValue));

	const setTrue = useCallback((): void => {
		setState(true);
	}, []);

	const setFalse = useCallback((): void => {
		setState(false);
	}, []);

	const toggle = useCallback((): void => {
		setState((prev: boolean): boolean => {
			return !prev;
		});
	}, []);

	const set = useCallback((value: boolean): void => {
		setState(Boolean(value));
	}, []);

	const actions = useMemo((): UseBooleanActions => {
		return { set, setTrue, setFalse, toggle };
	}, [set, setTrue, setFalse, toggle]);

	return [state, actions] as const;
}
