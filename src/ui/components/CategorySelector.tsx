import { Suspense, type JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/ui/components/Icon";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { CategorySelectorContentProps } from "@/ui/components/CategorySelectorContent";

interface CategorySelectorProps<T extends string> {
	readonly activeCategory: T;
	readonly categories: readonly T[];
	readonly onCategoryChange: (category: T) => void;
	readonly isDisabled?: boolean | undefined;
	readonly showAddButton?: boolean | undefined;
	readonly isAddDisabled?: boolean | undefined;
	readonly addTooltip?: string | undefined;
	readonly onInstallPlugin?: (() => void) | undefined;
}

const LazyCategorySelectorContent = lazyWithPreload<CategorySelectorContentProps<string>>(async () => {
	const mod = await import("./CategorySelectorContent");
	return { default: mod.CategorySelectorContent };
});

export function CategorySelector<T extends string>(props: CategorySelectorProps<T>): JSX.Element {
	const {
		activeCategory,
		categories,
		onCategoryChange,
		isDisabled,
		showAddButton,
		isAddDisabled,
		addTooltip,
		onInstallPlugin,
	} = props;
	const isSelectorDisabled = isDisabled ?? false;
	const shouldShowAddButton = showAddButton ?? false;
	const isAddButtonDisabled = isAddDisabled ?? false;

	return (
		<div className="ce-category-selector">
			<div className="ce-category-title-group">
				<div className="ce-category-current">{activeCategory}</div>
			</div>

			<div className="ce-category-actions">
				{shouldShowAddButton ? (
					<button
						aria-label={addTooltip ?? "Install plugin"}
						className="ce-category-add-btn"
						disabled={isAddButtonDisabled}
						title={addTooltip ?? "Install plugin"}
						type="submit"
						onClick={onInstallPlugin}
					>
						<Icon name="plus" />
					</button>
				) : null}

				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						<button
							aria-label="Switch Category"
							className="ce-category-hamburger"
							disabled={isSelectorDisabled}
							type="button"
							onFocus={(): void => {
								void LazyCategorySelectorContent.preload();
							}}
							onPointerDown={(): void => {
								void LazyCategorySelectorContent.preload();
							}}
							onPointerEnter={(): void => {
								void LazyCategorySelectorContent.preload();
							}}
						>
							<Icon name="menu" />
						</button>
					</DropdownMenu.Trigger>

					<Suspense fallback={null}>
						<LazyCategorySelectorContent
							activeCategory={activeCategory}
							categories={categories}
							onCategoryChange={(cat: string): void => {
								onCategoryChange(cat as T);
							}}
						/>
					</Suspense>
				</DropdownMenu.Root>
			</div>
		</div>
	);
}
