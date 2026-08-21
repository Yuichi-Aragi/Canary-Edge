import { useState, useCallback } from "react";

import { useTransitionAction } from "@/ui/hooks/useTransitionAction";

export interface UseCategoryTabResult<T extends string> {
	readonly activeCategory: T;
	readonly setActiveCategory: (category: T) => void;
	readonly isPending: boolean;
}

export function useCategoryTab<T extends string>(
	initialCategory: T
): UseCategoryTabResult<T> {
	const [activeCategory, setActiveCategory] = useState<T>(initialCategory);
	const { isPending, runTransition } = useTransitionAction();

	const handleSetActiveCategory = useCallback(
		(category: T): void => {
			runTransition((): void => {
				setActiveCategory(category);
			});
		},
		[runTransition]
	);

	return {
		activeCategory,
		setActiveCategory: handleSetActiveCategory,
		isPending,
	};
}
