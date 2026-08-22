import { useTransition, useCallback, useRef, useEffect } from "react";
import { safe } from "@/utils/safe";

export interface UseTransitionActionOptions {
	readonly onStart?: (() => void) | undefined;
	readonly onComplete?: (() => void) | undefined;
}

export interface UseTransitionActionResult {
	readonly isPending: boolean;
	readonly runTransition: (callback: () => void | Promise<void>) => void;
	readonly createTransitionCallback: <TArgs extends readonly unknown[]>(
		callback: (...args: TArgs) => void | Promise<void>
	) => (...args: TArgs) => void;
}

export function useTransitionAction(
	options?: Readonly<UseTransitionActionOptions>
): UseTransitionActionResult {
	const [isPending, startTransition] = useTransition();

	const optionsRef = useRef<Readonly<UseTransitionActionOptions> | undefined>(options);
	useEffect((): void => {
		optionsRef.current = options;
	});

	const runTransition = useCallback(
		(callback: () => void | Promise<void>): void => {
			optionsRef.current?.onStart?.();
			startTransition((): void => {
				void safe.async(async (_$, defer): Promise<void> => {
					defer((): void => {
						optionsRef.current?.onComplete?.();
					});

					const res = await safe.tryAsync(async (): Promise<void> => {
						await callback();
					});

					if (!res.ok) {
						console.error("[useTransitionAction] Transition execution failed:", res.error);
					}
				});
			});
		},
		[startTransition]
	);

	const createTransitionCallback = useCallback(
		<TArgs extends readonly unknown[]>(
			callback: (...args: TArgs) => void | Promise<void>
		): ((...args: TArgs) => void) => {
			return (...args: TArgs): void => {
				runTransition((): void | Promise<void> => {
					return callback(...args);
				});
			};
		},
		[runTransition]
	);

	return {
		isPending,
		runTransition,
		createTransitionCallback,
	};
}
