import { useEffect, useRef, type EffectCallback, type DependencyList } from "react";

function isDepsChanged(prevDeps: DependencyList | undefined, nextDeps: DependencyList | undefined): boolean {
	if (prevDeps === undefined || nextDeps === undefined) {
		return true;
	}
	if (prevDeps.length !== nextDeps.length) {
		return true;
	}
	for (let i = 0; i < prevDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i]) === false) {
			return true;
		}
	}
	return false;
}

export function useUpdateEffect(effect: EffectCallback, deps?: DependencyList): void {
	const isMountedRef = useRef<boolean>(false);
	const effectRef = useRef<EffectCallback>(effect);
	const prevDepsRef = useRef<DependencyList | undefined>(deps);

	useEffect((): ReturnType<EffectCallback> => {
		effectRef.current = effect;

		if (isMountedRef.current === false) {
			isMountedRef.current = true;
			prevDepsRef.current = deps;
			return undefined;
		}

		if (isDepsChanged(prevDepsRef.current, deps)) {
			prevDepsRef.current = deps;
			return effectRef.current();
		}

		return undefined;
	});
}
