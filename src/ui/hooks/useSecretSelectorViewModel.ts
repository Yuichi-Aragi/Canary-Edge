import { useMemo, useCallback } from "react";
import MiniSearch from "minisearch";

import { useBoolean } from "@/ui/hooks/useBoolean";
import { useModalListSearch } from "@/ui/hooks/useModalListSearch";
import { safe } from "@/utils/safe";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

export interface SecretSelectorViewState {
	readonly isOpen: boolean;
	readonly searchQuery: string;
	readonly deferredQuery: string;
	readonly filteredOptions: readonly string[];
	readonly displayValue: string;
	readonly showNone: boolean;
	readonly listData: readonly string[];
	readonly listHeight: number;
	readonly activeIndex: number;
	readonly activeValue: string;
}

export interface SecretSelectorViewActions {
	readonly setIsOpen: (isOpen: boolean) => void;
	readonly openModal: () => void;
	readonly closeModal: () => void;
	readonly setSearchQuery: (query: string) => void;
	readonly handleSelect: (val: string) => void;
	readonly handleItemMouseEnter: (index: number) => void;
	readonly handleKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	readonly setActiveIndex: (index: number | ((prev: number) => number)) => void;
}

export interface SecretSelectorViewModelOptions {
	readonly value: string;
	readonly options: readonly string[];
	readonly onChange: (value: string) => void;
	readonly virtuosoRef?: RefObject<VirtuosoHandle | null> | undefined;
}

export interface SecretSelectorViewModel {
	readonly state: SecretSelectorViewState;
	readonly actions: SecretSelectorViewActions;
}

interface StringDoc {
	readonly id: string;
	readonly text: string;
}

function searchStringList(
	list: readonly string[],
	query: string,
	enableFuzzy = true
): readonly string[] {
	const cleanQuery = query.trim();
	if (cleanQuery === "" || list.length === 0) {
		return list;
	}

	const searchRes = safe.try((): readonly string[] => {
		const docs: StringDoc[] = list.map((item: string, idx: number): StringDoc => {
			return { id: String(idx), text: item };
		});

		const miniSearch = new MiniSearch<StringDoc>({
			fields: ["text"],
			storeFields: ["id", "text"],
			idField: "id",
		});

		miniSearch.addAll(docs);

		const results = miniSearch.search(cleanQuery, {
			prefix: true,
			fuzzy: enableFuzzy === true ? (term: string): number | false => {
				return term.length >= 3 ? 0.2 : false;
			} : false,
			combineWith: "AND",
		});

		return results
			.map((r): string => {
				const idx = Number(String(r.id));
				return list[idx] ?? "";
			})
			.filter((s): boolean => {
				return s !== "";
			});
	});

	return safe.unwrapOr(searchRes, []);
}

export function useSecretSelectorViewModel(
	options: Readonly<SecretSelectorViewModelOptions>
): SecretSelectorViewModel {
	const { value, options: rawOptions, onChange, virtuosoRef } = options;

	const [isOpenValue, { set: setIsOpen }] = useBoolean(false);

	const closeModal = useCallback((): void => {
		setIsOpen(false);
	}, [setIsOpen]);

	const handleSelect = useCallback(
		(selectedValue: string): void => {
			onChange(selectedValue);
			closeModal();
		},
		[onChange, closeModal]
	);

	const displayValue = value !== "" ? value : "None";

	const openModal = useCallback((): void => {
		setIsOpen(true);
	}, [setIsOpen]);

	const filteredOptions = useMemo((): readonly string[] => {
		return rawOptions;
	}, [rawOptions]);

	const showNone = true;

	const listData = useMemo((): readonly string[] => {
		return showNone === true ? ["", ...filteredOptions] : filteredOptions;
	}, [showNone, filteredOptions]);

	const getItemId = useCallback((item: string): string => {
		return item;
	}, []);

	const {
		searchQuery,
		deferredQuery,
		activeIndex,
		activeValue,
		listHeight,
		setSearchQuery,
		handleItemMouseEnter,
		handleKeyDown,
		setActiveIndex,
		resetSearch,
	} = useModalListSearch({
		items: listData,
		getItemId,
		virtuosoRef,
		itemHeight: 52,
		maxHeight: 280,
		pageJump: 5,
		onSelect: handleSelect,
		onClose: closeModal,
	});

	const searchFilteredOptions = useMemo((): readonly string[] => {
		return searchStringList(rawOptions, deferredQuery, true);
	}, [rawOptions, deferredQuery]);

	const effectiveShowNone = useMemo((): boolean => {
		const query = deferredQuery.trim();
		if (query === "") {
			return true;
		}
		return searchStringList(["None"], query, true).length > 0;
	}, [deferredQuery]);

	const effectiveListData = useMemo((): readonly string[] => {
		return effectiveShowNone === true ? ["", ...searchFilteredOptions] : searchFilteredOptions;
	}, [effectiveShowNone, searchFilteredOptions]);

	const handleOpenModal = useCallback((): void => {
		resetSearch();
		openModal();
	}, [resetSearch, openModal]);

	return {
		state: {
			isOpen: isOpenValue,
			searchQuery,
			deferredQuery,
			filteredOptions: searchFilteredOptions,
			displayValue,
			showNone: effectiveShowNone,
			listData: effectiveListData,
			listHeight,
			activeIndex,
			activeValue,
		},
		actions: {
			setIsOpen,
			openModal: handleOpenModal,
			closeModal,
			setSearchQuery,
			handleSelect,
			handleItemMouseEnter,
			handleKeyDown,
			setActiveIndex,
		},
	};
}
