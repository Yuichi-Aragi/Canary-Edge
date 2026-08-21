import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useDrag } from "@use-gesture/react";
import { clamp } from "es-toolkit";

import { WINDOW_CONSTANTS, type WindowState } from "../types";

export interface UseInteractWindowArgs {
	readonly windowRef: RefObject<HTMLDivElement | null>;
	readonly ghostRef: RefObject<HTMLDivElement | null>;
	readonly displayRect: WindowState;
	readonly setWindowState: (state: WindowState) => void;
}

interface DragMemo {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export function useInteractWindow({
	windowRef,
	ghostRef,
	displayRect,
	setWindowState
}: UseInteractWindowArgs): void {
	const stateRef = useRef<WindowState>({ ...displayRect });
	const isInteractingRef = useRef<boolean>(false);
	const frameIdRef = useRef<number | null>(null);
	const ghostFrameIdRef = useRef<number | null>(null);
	const pendingStateRef = useRef<WindowState | null>(null);

	const pendingRef = useRef<{ 
		readonly x: number; 
		readonly y: number; 
		readonly w: number | undefined; 
		readonly h: number | undefined; 
	} | null>(null);

	const pendingGhostRef = useRef<{ 
		readonly x: number; 
		readonly y: number; 
		readonly w: number; 
		readonly h: number; 
	} | null>(null);

	const getSafeBounds = useCallback((): { readonly safeW: number; readonly safeH: number } => {
		const { innerWidth: winWidth, innerHeight: winHeight } = window;
		const w = winWidth > 0 ? winWidth : 1024;
		const h = winHeight > 0 ? winHeight : 768;
		return {
			safeW: Math.max(0, w - (WINDOW_CONSTANTS.SIDE_PADDING * 2)),
			safeH: Math.max(0, h - WINDOW_CONSTANTS.TOP_SAFE_ZONE - WINDOW_CONSTANTS.BOTTOM_PADDING)
		};
	}, []);

	const updateTransform = useCallback((
		el: HTMLElement, 
		x: number, 
		y: number, 
		w: number | undefined, 
		h: number | undefined
	): void => {
		const styles: Record<string, string> = {
			transform: `translate3d(${x.toString()}px, ${y.toString()}px, 0)`
		};
		if (w !== undefined && h !== undefined) {
			styles["width"] = `${w.toString()}px`;
			styles["height"] = `${h.toString()}px`;
		}
		el.setCssStyles(styles);
	}, []);

	const lockWindowContent = useCallback((): void => {
		if (windowRef.current === null) {
			return;
		}
		const contentEl = windowRef.current.querySelector(".ce-ce-window-content") as HTMLElement | null;
		if (contentEl !== null) {
			const rect = contentEl.getBoundingClientRect();
			contentEl.setCssStyles({
				width: `${rect.width.toString()}px`,
				height: `${rect.height.toString()}px`
			});
			contentEl.classList.add("is-frozen");
		}
	}, [windowRef]);

	const unlockWindowContent = useCallback((): void => {
		if (windowRef.current === null) {
			return;
		}
		const contentEl = windowRef.current.querySelector(".ce-ce-window-content") as HTMLElement | null;
		if (contentEl !== null) {
			contentEl.setCssStyles({
				width: "",
				height: ""
			});
			contentEl.classList.remove("is-frozen");
		}
	}, [windowRef]);

	const handleStart = useCallback((type: "dragging" | "resizing"): void => {
		isInteractingRef.current = true;
		activeDocument.body.classList.add("ce-window-interacting");

		if (windowRef.current !== null) {
			windowRef.current.classList.add(type === "dragging" ? "is-dragging" : "is-resizing");
			lockWindowContent();
		}

		if (type === "resizing" && ghostRef.current !== null) {
			const { x, y, width, height } = stateRef.current;
			ghostRef.current.setCssStyles({
				transform: `translate3d(${x.toString()}px, ${y.toString()}px, 0)`,
				width: `${width.toString()}px`,
				height: `${height.toString()}px`,
				display: "block",
				opacity: "1"
			});
			ghostRef.current.classList.add("is-visible");
		}
	}, [windowRef, ghostRef, lockWindowContent]);

	const handleEnd = useCallback((type: "dragging" | "resizing"): void => {
		isInteractingRef.current = false;
		activeDocument.body.classList.remove("ce-window-interacting");

		if (windowRef.current !== null) {
			windowRef.current.classList.remove("is-dragging", "is-resizing");
		}

		const finalState = { ...stateRef.current };
		pendingStateRef.current = finalState;

		if (windowRef.current !== null) {
			const { x, y, width, height } = finalState;
			updateTransform(
				windowRef.current,
				x,
				y,
				width,
				height
			);
		}
		unlockWindowContent();

		if (type === "resizing" && ghostRef.current !== null) {
			ghostRef.current.classList.remove("is-visible");
			ghostRef.current.setCssStyles({
				display: "none",
				opacity: "0"
			});
		}

		const hasRequestIdleCallback = "requestIdleCallback" in window;
		if (hasRequestIdleCallback === true) {
			window.requestIdleCallback((): void => {
				setWindowState(finalState);
			}, { timeout: 100 });
		} else {
			window.setTimeout((): void => {
				setWindowState(finalState);
			}, 0);
		}
	}, [setWindowState, updateTransform, windowRef, ghostRef, unlockWindowContent]);

	const scheduleUpdate = useCallback((
		x: number, 
		y: number, 
		w: number | undefined, 
		h: number | undefined
	): void => {
		pendingRef.current = { x, y, w, h };
		
		const currentFrameId = frameIdRef.current;
		if (currentFrameId === null) {
			frameIdRef.current = window.requestAnimationFrame((): void => {
				if (pendingRef.current !== null && windowRef.current !== null) {
					const { x: px, y: py, w: pw, h: ph } = pendingRef.current;
					updateTransform(windowRef.current, px, py, pw, ph);
				}
				frameIdRef.current = null;
			});
		}
	}, [updateTransform, windowRef]);

	const scheduleGhostUpdate = useCallback((x: number, y: number, w: number, h: number): void => {
		pendingGhostRef.current = { x, y, w, h };

		const currentGhostFrameId = ghostFrameIdRef.current;
		if (currentGhostFrameId === null) {
			ghostFrameIdRef.current = window.requestAnimationFrame((): void => {
				if (pendingGhostRef.current !== null && ghostRef.current !== null) {
					const { x: px, y: py, w: pw, h: ph } = pendingGhostRef.current;
					ghostRef.current.setCssStyles({
						transform: `translate3d(${px.toString()}px, ${py.toString()}px, 0)`,
						width: `${pw.toString()}px`,
						height: `${ph.toString()}px`
					});
				}
				ghostFrameIdRef.current = null;
			});
		}
	}, [ghostRef]);

	useEffect((): (() => void) => {
		if (windowRef.current === null) {
			return (): void => {};
		}

		let animationFrameId: number;

		const handleResize = (): void => {
			if (isInteractingRef.current === true) {
				return;
			}

			window.cancelAnimationFrame(animationFrameId);
			animationFrameId = window.requestAnimationFrame((): void => {
				const { safeW, safeH } = getSafeBounds();
				const { width: rectW, height: rectH, x: rectX, y: rectY } = displayRect;
				
				const width = clamp(rectW, WINDOW_CONSTANTS.MIN_WIDTH, safeW);
				const height = clamp(rectH, WINDOW_CONSTANTS.MIN_HEIGHT, safeH);
				const x = clamp(rectX, 0, Math.max(0, safeW - width));
				const y = clamp(rectY, 0, Math.max(0, safeH - height));

				const { x: stX, y: stY, width: stW, height: stH } = stateRef.current;
				if (
					stX !== x || 
					stY !== y || 
					stW !== width || 
					stH !== height
				) {
					stateRef.current = { x, y, width, height };
					
					if (windowRef.current !== null) {
						updateTransform(windowRef.current, x, y, width, height);
					}
				}
			});
		};

		window.addEventListener("resize", handleResize);
		
		handleResize();

		return (): void => {
			window.removeEventListener("resize", handleResize);
			window.cancelAnimationFrame(animationFrameId);
		};
	}, [windowRef, updateTransform, getSafeBounds, displayRect]);

	useEffect((): (() => void) => {
		const currentWindow = windowRef.current;

		return (): void => {
			if (frameIdRef.current !== null) {
				window.cancelAnimationFrame(frameIdRef.current);
				frameIdRef.current = null;
			}
			if (ghostFrameIdRef.current !== null) {
				window.cancelAnimationFrame(ghostFrameIdRef.current);
				ghostFrameIdRef.current = null;
			}
			pendingRef.current = null;
			pendingGhostRef.current = null;
			pendingStateRef.current = null;
			activeDocument.body.classList.remove("ce-window-interacting");

			if (currentWindow !== null) {
				const contentEl = currentWindow.querySelector(".ce-ce-window-content") as HTMLElement | null;
				if (contentEl !== null) {
					contentEl.setCssStyles({
						width: "",
						height: ""
					});
					contentEl.classList.remove("is-frozen");
				}
			}
		};
	}, [windowRef]);

	useLayoutEffect((): void => {
		if (windowRef.current === null) {
			return;
		}

		if (isInteractingRef.current === true) {
			return;
		}

		const { x: rectX, y: rectY, width: rectW, height: rectH } = displayRect;

		if (pendingStateRef.current !== null) {
			const { x: psX, y: psY, width: psW, height: psH } = pendingStateRef.current;
			const matches = 
				rectX === psX &&
				rectY === psY &&
				rectW === psW &&
				rectH === psH;

			if (matches === true) {
				pendingStateRef.current = null;
			} else {
				return;
			}
		}

		const { safeW, safeH } = getSafeBounds();
		const width = clamp(rectW, WINDOW_CONSTANTS.MIN_WIDTH, safeW);
		const height = clamp(rectH, WINDOW_CONSTANTS.MIN_HEIGHT, safeH);
		const x = clamp(rectX, 0, Math.max(0, safeW - width));
		const y = clamp(rectY, 0, Math.max(0, safeH - height));

		stateRef.current = { x, y, width, height };
		updateTransform(windowRef.current, x, y, width, height);
	}, [displayRect, updateTransform, windowRef, getSafeBounds]);

	useDrag(({ event: gestureEvent, first, last, movement: [mx, my], memo }) => {
		const dragMemo: DragMemo | undefined = memo as DragMemo | undefined;
		const { target } = gestureEvent;
		if (!(target instanceof Element)) {
			return dragMemo;
		}

		const isResize = target.closest(".ce-resize-handle-br") !== null;
		const isDrag = target.closest(".ce-window-drag-handle") !== null;
		const isControl = target.closest(".ce-ce-window-controls") !== null;

		if ((isResize === false && isDrag === false) || isControl === true) {
			return dragMemo;
		}

		if (first === true) {
			handleStart(isResize ? "resizing" : "dragging");
			const { x, y, width: w, height: h } = stateRef.current;
			const initialMemo: DragMemo = { x, y, w, h };
			return initialMemo;
		}

		if (dragMemo === undefined) {
			return undefined;
		}

		const { safeW, safeH } = getSafeBounds();

		if (isResize === true) {
			const { w, h } = dragMemo;
			const nextW = clamp(w + mx, WINDOW_CONSTANTS.MIN_WIDTH, safeW);
			const nextH = clamp(h + my, WINDOW_CONSTANTS.MIN_HEIGHT, safeH);
			stateRef.current.width = nextW;
			stateRef.current.height = nextH;

			const { x, y } = stateRef.current;
			scheduleGhostUpdate(x, y, nextW, nextH);
		} else if (isDrag === true) {
			const { x, y } = dragMemo;
			const { width: stW, height: stH } = stateRef.current;
			const nextX = clamp(x + mx, 0, Math.max(0, safeW - stW));
			const nextY = clamp(y + my, 0, Math.max(0, safeH - stH));
			stateRef.current.x = nextX;
			stateRef.current.y = nextY;
			
			scheduleUpdate(nextX, nextY, undefined, undefined);
		}

		if (last === true) {
			handleEnd(isResize ? "resizing" : "dragging");
		}

		return dragMemo;
	}, {
		target: windowRef,
		eventOptions: { passive: false }
	});
}
