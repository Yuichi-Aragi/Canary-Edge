import type { JSX } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { usePortalContext } from "@/ui/context/PortalContext";

export interface CategorySelectorContentProps<T extends string> {
	readonly activeCategory: T;
	readonly categories: readonly T[];
	readonly onCategoryChange: (category: T) => void;
}

export function CategorySelectorContent<T extends string>(props: CategorySelectorContentProps<T>): JSX.Element {
	const { portalRef } = usePortalContext();
	const { activeCategory, categories, onCategoryChange } = props;

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="end"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={8}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{categories.map((cat): JSX.Element => (
					<DropdownMenu.Item
						key={cat}
						className={clsx(
							"ce-dropdown-item",
							activeCategory === cat ? "is-active" : ""
						)}
						onSelect={(): void => {
							onCategoryChange(cat);
						}}
					>
						{cat}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}
