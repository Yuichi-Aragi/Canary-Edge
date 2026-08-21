import { useState, useRef, useEffect, useCallback } from "react";

import { useUpdateEffect } from "@/ui/hooks/useUpdateEffect";
import { safe } from "@/utils/safe";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

export interface UseVirtualListNavigationOptions {
	readonly itemCount: number;
	readonly virtuosoRef?: RefObject<VirtuosoHandle | null> | undefined;
	readonly onEnter?: ((activeIndex: number, e: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly onEscape?: ((e: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly onBackspace?: ((e: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly onNavigate?: ((e: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly onUnhandled?: ((e: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly scrollBehavior?: "auto" | "smooth" | undefined;
	readonly initialIndex?: number | undefined;
	readonly pageJump?: number | undefined;
}

export interface UseVirtualListNavigationResult {
	readonly activeIndex: number;
	readonly setActiveIndex: (index: number | ((prev: number) => number)) => void;
	readonly handleKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
	readonly handleItemMouseEnter: (index: number) => void;
}

export function useVirtualListNavigation(options: UseVirtualListNavigationOptions): UseVirtualListNavigationResult {
	const {
		itemCount,
		virtuosoRef,
		onEnter,
		onEscape,
		onBackspace,
		onNavigate,
		onUnhandled,
	} = options;

	const scrollBehavior = options.scrollBehavior ?? "auto";
	const initialIndex = options.initialIndex ?? 0;
	const pageJump = options.pageJump ?? 5;

	const [activeIndex, setActiveIndex] = useState<number>(initialIndex);
	const isKeyboardNavigatingRef = useRef<boolean>(false);
	const lastMousePosRef = useRef<{ readonly x: number; readonly y: number }>({ x: -1, y: -1 });

	const safeActiveIndex = itemCount === 0 ? 0 : Math.max(0, Math.min(activeIndex, itemCount - 1));

	useEffect((): (() => void) => {
		const handleMouseMove = (e: MouseEvent): void => {
			if (
				lastMousePosRef.current.x !== e.clientX ||
				lastMousePosRef.current.y !== e.clientY
			) {
				lastMousePosRef.current = { x: e.clientX, y: e.clientY };
				isKeyboardNavigatingRef.current = false;
			}
		};
		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		return (): void => {
			window.removeEventListener("mousemove", handleMouseMove);
		};
	}, []);

	useUpdateEffect((): void => {
		if (virtuosoRef?.current !== null && virtuosoRef?.current !== undefined && itemCount > 0) {
			const res = safe.try((): void => {
				virtuosoRef.current?.scrollIntoView({
					index: safeActiveIndex,
					behavior: scrollBehavior,
				});
			});
			if (res.ok === false) {
				console.error("[useVirtualListNavigation] Failed to scroll into view:", res.error);
			}
		}
	}, [safeActiveIndex, itemCount, virtuosoRef, scrollBehavior]);

	const handleItemMouseEnter = useCallback((index: number): void => {
		if (isKeyboardNavigatingRef.current === true) {
			return;
		}
		setActiveIndex(index);
	}, []);

	const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>): void => {
		if (itemCount === 0 && e.key !== "Escape" && e.key !== "Backspace" && e.key !== "Enter") {
			onUnhandled?.(e);
			return;
		}

		if (
			e.key === "ArrowDown" ||
			e.key === "ArrowUp" ||
			e.key === "Home" ||
			e.key === "End" ||
			e.key === "PageDown" ||
			e.key === "PageUp"
		) {
			isKeyboardNavigatingRef.current = true;
			onNavigate?.(e);
		}

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((prev: number): number => {
				return prev < itemCount - 1 ? prev + 1 : prev;
			});
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((prev: number): number => {
				return prev > 0 ? prev - 1 : 0;
			});
		} else if (e.key === "Home") {
			e.preventDefault();
			setActiveIndex(0);
		} else if (e.key === "End") {
			e.preventDefault();
			setActiveIndex(Math.max(0, itemCount - 1));
		} else if (e.key === "PageDown") {
			e.preventDefault();
			setActiveIndex((prev: number): number => {
				return Math.min(prev + pageJump, Math.max(0, itemCount - 1));
			});
		} else if (e.key === "PageUp") {
			e.preventDefault();
			setActiveIndex((prev: number): number => {
				return Math.max(prev - pageJump, 0);
			});
		} else if (e.key === "Enter") {
			onEnter?.(safeActiveIndex, e);
		} else if (e.key === "Escape") {
			onEscape?.(e);
		} else if (e.key === "Backspace") {
			onBackspace?.(e);
		} else {
			onUnhandled?.(e);
		}
	}, [itemCount, onEnter, onEscape, onBackspace, onNavigate, onUnhandled, safeActiveIndex, pageJump]);

	return {
		activeIndex: safeActiveIndex,
		setActiveIndex,
		handleKeyDown,
		handleItemMouseEnter,
	};
}
