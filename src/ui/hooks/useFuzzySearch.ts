import { useMemo } from "react";
import MiniSearch, { type SearchOptions } from "minisearch";

import { safe } from "@/utils/safe";

export type FuzzySearchMatchedItem<T> = T & {
	readonly _fuzzyResult?: readonly unknown[] | undefined;
	readonly _score?: number | undefined;
};

export interface FuzzySearchOptions {
	readonly enableFuzzy?: boolean | undefined;
	readonly fuzzyThreshold?: number | ((term: string) => number | false) | undefined;
	readonly prefix?: boolean | undefined;
	readonly combineWith?: "AND" | "OR" | undefined;
	readonly boost?: Readonly<Record<string, number>> | undefined;
}

interface MiniSearchDocument<T> {
	readonly _msId: string;
	readonly _rawItem: T;
	readonly [key: string]: unknown;
}

interface SearchIndexContainer<T> {
	readonly miniSearch: MiniSearch<MiniSearchDocument<T>>;
	readonly itemsMap: readonly T[];
}

export function useFuzzySearch<T extends Record<string, unknown>>(
	items: readonly T[],
	query: string,
	keys: readonly string[],
	options?: Readonly<FuzzySearchOptions>
): readonly FuzzySearchMatchedItem<T>[] {
	const indexContainer = useMemo((): SearchIndexContainer<T> | null => {
		if (items.length === 0) {
			return null;
		}

		const result = safe.try((): SearchIndexContainer<T> => {
			const fieldsList = keys.map((k: string): string => {
				return String(k);
			});

			const documents: MiniSearchDocument<T>[] = items.map(
				(item: T, index: number): MiniSearchDocument<T> => {
					const doc: Record<string, unknown> = {
						_msId: String(index),
						_rawItem: item,
					};
					for (const k of keys) {
						const val = item[k];
						doc[k] = typeof val === "string" || typeof val === "number" ? String(val) : "";
					}
					return doc as MiniSearchDocument<T>;
				}
			);

			const miniSearch = new MiniSearch<MiniSearchDocument<T>>({
				fields: fieldsList,
				storeFields: ["_msId"],
				idField: "_msId",
			});

			miniSearch.addAll(documents);

			return {
				miniSearch,
				itemsMap: items,
			};
		});

		return safe.unwrapOr(result, null);
	}, [items, keys]);

	return useMemo((): readonly FuzzySearchMatchedItem<T>[] => {
		const cleanQuery = query.trim();
		if (cleanQuery === "" || items.length === 0 || indexContainer === null) {
			return items as readonly FuzzySearchMatchedItem<T>[];
		}

		const enableFuzzy = options?.enableFuzzy ?? true;
		const fuzzyThreshold =
			options?.fuzzyThreshold ??
			((term: string): number | false => {
				return term.length >= 3 ? 0.2 : false;
			});
		const prefix = options?.prefix ?? true;
		const combineWith = options?.combineWith ?? "AND";
		const boost = options?.boost;

		const searchResult = safe.try((): readonly FuzzySearchMatchedItem<T>[] => {
			const searchParams: SearchOptions = {
				prefix,
				combineWith,
				fuzzy: enableFuzzy === true ? fuzzyThreshold : false,
				...(boost !== undefined ? { boost } : {}),
			};

			const results = indexContainer.miniSearch.search(cleanQuery, searchParams);

			return results.map((res): FuzzySearchMatchedItem<T> => {
				const resIdStr = String(res.id);
				const docIndex = Number(resIdStr);
				const originalItem = indexContainer.itemsMap[docIndex];
				if (originalItem === undefined) {
					throw new Error(`Invalid document reference index: ${resIdStr}`);
				}
				return {
					...originalItem,
					_score: res.score,
					_fuzzyResult: res.terms as readonly unknown[],
				};
			});
		});

		return safe.unwrapOr(searchResult, []);
	}, [indexContainer, query, items, options]);
}
