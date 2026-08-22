import {
	useState,
	useRef,
	useCallback,
	useMemo,
	useDeferredValue,
	useEffect,
} from "react";
import type { RefObject, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { useVirtualListNavigation } from "@/ui/hooks/useVirtualListNavigation";
import { safe } from "@/utils/safe";

const DEFAULT_ITEM_HEIGHT = 56;
const DEFAULT_MAX_HEIGHT = 320;
const DEFAULT_MIN_HEIGHT = 56;
const DEFAULT_PAGE_JUMP = 10;
const SCROLL_RESET_INDEX = 0;

export interface UseModalListSearchOptions<T> {
	readonly items: readonly T[];
	readonly getItemId: (item: T) => string;
	readonly virtuosoRef?: RefObject<VirtuosoHandle | null> | undefined;
	readonly itemHeight?: number | undefined;
	readonly maxHeight?: number | undefined;
	readonly minHeight?: number | undefined;
	readonly pageJump?: number | undefined;
	readonly searchQuery?: string | undefined;
	readonly setSearchQuery?: ((query: string) => void) | undefined;
	readonly onSelect?: ((item: T, e?: ReactKeyboardEvent<HTMLElement>) => void) | undefined;
	readonly onClose?: (() => void) | undefined;
}

export interface UseModalListSearchResult<T> {
	readonly searchQuery: string;
	readonly deferredQuery: string;
	readonly activeIndex: number;
	readonly activeItem: T | undefined;
	readonly activeValue: string;
	readonly listHeight: number;
	readonly setSearchQuery: (query: string) => void;
	readonly handleItemMouseEnter: (index: number) => void;
	readonly handleKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
	readonly setActiveIndex: (index: number | ((prev: number) => number)) => void;
	readonly resetSearch: () => void;
}

export function useModalListSearch<T>(
	options: Readonly<UseModalListSearchOptions<T>>
): UseModalListSearchResult<T> {
	const {
		items,
		getItemId,
		virtuosoRef,
		onSelect,
		onClose,
		searchQuery: externalSearchQuery,
		setSearchQuery: externalSetSearchQuery,
	} = options;

	const itemHeight = options.itemHeight ?? DEFAULT_ITEM_HEIGHT;
	const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
	const minHeight = options.minHeight ?? DEFAULT_MIN_HEIGHT;
	const pageJump = options.pageJump ?? DEFAULT_PAGE_JUMP;

	const [internalSearchQuery, setInternalSearchQuery] = useState<string>("");
	const searchQuery = externalSearchQuery ?? internalSearchQuery;

	const setSearchQuery = useCallback(
		(query: string): void => {
			if (externalSetSearchQuery !== undefined) {
				externalSetSearchQuery(query);
			} else {
				setInternalSearchQuery(query);
			}
		},
		[externalSetSearchQuery]
	);

	const deferredQuery = useDeferredValue(searchQuery);
	const prevQueryRef = useRef<string>(searchQuery);

	const safeOnSelect = useCallback(
		(index: number, e: ReactKeyboardEvent<HTMLElement>): void => {
			const targetItem = items[index];
			if (targetItem !== undefined && onSelect !== undefined) {
				onSelect(targetItem, e);
			}
		},
		[items, onSelect]
	);

	const safeOnEscape = useCallback(
		(_e: ReactKeyboardEvent<HTMLElement>): void => {
			if (onClose !== undefined) {
				onClose();
			}
		},
		[onClose]
	);

	const safeOnBackspace = useCallback(
		(_e: ReactKeyboardEvent<HTMLElement>): void => {
			// No-op: backspace text manipulation is handled natively by the input element
		},
		[]
	);

	const {
		activeIndex,
		setActiveIndex,
		handleKeyDown,
		handleItemMouseEnter,
	} = useVirtualListNavigation({
		itemCount: items.length,
		virtuosoRef,
		pageJump,
		onEnter: safeOnSelect,
		onEscape: safeOnEscape,
		onBackspace: safeOnBackspace,
	});

	useEffect((): void => {
		if (prevQueryRef.current !== searchQuery) {
			prevQueryRef.current = searchQuery;
			setActiveIndex(0);
			if (virtuosoRef?.current !== null && virtuosoRef?.current !== undefined) {
				const res = safe.try((): void => {
					virtuosoRef.current?.scrollToIndex({ index: SCROLL_RESET_INDEX, align: "start" });
				});
				if (!res.ok) {
					console.error("[useModalListSearch] Failed to scroll to index:", res.error);
				}
			}
		}
	}, [searchQuery, virtuosoRef, setActiveIndex]);

	const clampedIndex = items.length === 0 ? 0 : Math.max(0, Math.min(activeIndex, items.length - 1));
	const activeItem = items[clampedIndex];
	const activeValue = activeItem !== undefined ? getItemId(activeItem) : "";

	const listHeight = useMemo((): number => {
		if (items.length === 0) {
			return minHeight;
		}
		const calculated = items.length * itemHeight;
		return Math.min(Math.max(calculated, minHeight), maxHeight);
	}, [items.length, itemHeight, minHeight, maxHeight]);

	const resetSearch = useCallback((): void => {
		setSearchQuery("");
		setActiveIndex(0);
	}, [setActiveIndex, setSearchQuery]);

	return {
		searchQuery,
		deferredQuery,
		activeIndex: clampedIndex,
		activeItem,
		activeValue,
		listHeight,
		setSearchQuery,
		handleItemMouseEnter,
		handleKeyDown,
		setActiveIndex,
		resetSearch,
	};
}
