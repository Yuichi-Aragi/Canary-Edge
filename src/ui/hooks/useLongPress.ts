import { useRef, useCallback, useEffect, type PointerEvent as ReactPointerEvent } from "react";

interface LongPressOptions {
	readonly delay?: number | undefined;
	readonly onLongPress: (e: ReactPointerEvent<HTMLElement>) => void;
	readonly onClick?: ((e: ReactPointerEvent<HTMLElement>) => void) | undefined;
}

export function useLongPress(options: LongPressOptions): {
	readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
} {
	const { onLongPress, onClick } = options;
	const delay = options.delay ?? 500;

	const timeoutRef = useRef<number | null>(null);
	const isLongPressActive = useRef<boolean>(false);
	const startPointRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

	useEffect((): (() => void) => {
		return (): void => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, []);

	const start = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
		if (e.button !== 0) {
			return;
		}

		isLongPressActive.current = false;
		startPointRef.current = { x: e.clientX, y: e.clientY };

		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
		}

		timeoutRef.current = window.setTimeout((): void => {
			isLongPressActive.current = true;
			onLongPress(e);
		}, delay);
	}, [delay, onLongPress]);

	const clear = useCallback((e: ReactPointerEvent<HTMLElement>, shouldTriggerClick = true): void => {
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}

		if (shouldTriggerClick === true && isLongPressActive.current === false && onClick !== undefined) {
			const startPoint = startPointRef.current;
			const distance = startPoint !== null 
				? Math.hypot(e.clientX - startPoint.x, e.clientY - startPoint.y) 
				: 0;

			if (distance < 10) {
				onClick(e);
			}
		}

		isLongPressActive.current = false;
		startPointRef.current = null;
	}, [onClick]);

	const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
		start(e);
	}, [start]);

	const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
		clear(e, true);
	}, [clear]);

	const handlePointerLeave = useCallback((e: ReactPointerEvent<HTMLElement>): void => {
		clear(e, false);
	}, [clear]);

	return {
		onPointerDown: handlePointerDown,
		onPointerUp: handlePointerUp,
		onPointerLeave: handlePointerLeave,
	};
}
