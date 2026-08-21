import { Suspense, memo, type JSX } from "react";
import { Root as DropdownMenuRoot, Trigger as DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";

import { Icon } from "@/ui/components/Icon";
import { useDropdownOpenState } from "@/ui/hooks/useDropdownOpenState";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { DashboardFilterType } from "@/domain/types";
import type { DashboardFilterContentProps } from "./DashboardFilterContent";

const filterBadge = cva("ce-filter-badge", {
	variants: {
		active: { true: "is-visible", false: "is-hidden" },
	},
	defaultVariants: { active: false },
});

interface DashboardFilterDropdownProps {
	readonly activeFilters: ReadonlySet<DashboardFilterType>;
	readonly onToggleFilter: (filter: DashboardFilterType) => void;
	readonly activeDropdownId: string | null;
	readonly onOpenDropdown: (id: string | null) => void;
	readonly isScrolling: boolean;
	readonly hasActiveInstallations: boolean;
}

const LazyDashboardFilterContent = lazyWithPreload<DashboardFilterContentProps>(async () => {
	const mod = await import("./DashboardFilterContent");
	return { default: mod.DashboardFilterContent };
});

export const DashboardFilterDropdown = memo(({
	activeFilters,
	onToggleFilter,
	activeDropdownId,
	onOpenDropdown,
	isScrolling,
	hasActiveInstallations,
}: DashboardFilterDropdownProps): JSX.Element => {
	const dropdownId = "filter-dropdown";
	const { isOpen, handleOpenChange } = useDropdownOpenState({
		menuId: dropdownId,
		isScrolling,
		activeDropdownId,
		onOpenDropdown,
	});

	const filterTriggerClass = activeFilters.size > 0 ? "clickable-icon is-active" : "clickable-icon";

	return (
		<div className="ce-filter-container">
			<DropdownMenuRoot open={isOpen} onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<button
						aria-label="Filter"
						className={filterTriggerClass}
						disabled={isScrolling}
						type="button"
						onFocus={(): void => {
							void LazyDashboardFilterContent.preload();
						}}
						onPointerDown={(): void => {
							void LazyDashboardFilterContent.preload();
						}}
						onPointerEnter={(): void => {
							void LazyDashboardFilterContent.preload();
						}}
					>
						<Icon name="filter" />
					</button>
				</DropdownMenuTrigger>
				{isOpen ? (
					<Suspense fallback={null}>
						<LazyDashboardFilterContent
							activeFilters={activeFilters}
							hasActiveInstallations={hasActiveInstallations}
							onToggleFilter={onToggleFilter}
						/>
					</Suspense>
				) : null}
			</DropdownMenuRoot>
			<span className={filterBadge({ active: activeFilters.size > 0 })}>{activeFilters.size}</span>
		</div>
	);
});
DashboardFilterDropdown.displayName = "DashboardFilterDropdown";
