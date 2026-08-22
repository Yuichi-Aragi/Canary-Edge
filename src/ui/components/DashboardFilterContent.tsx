import type { JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/ui/components/Icon";
import { usePortalContext } from "@/ui/context/PortalContext";

import type { DashboardFilterType } from "@/domain/types";

export interface DashboardFilterContentProps {
	readonly activeFilters: ReadonlySet<DashboardFilterType>;
	readonly onToggleFilter: (filter: DashboardFilterType) => void;
	readonly hasActiveInstallations: boolean;
}

const BASE_FILTERS: readonly DashboardFilterType[] = ["frozen", "incompatible", "untracked"] as const;

export function DashboardFilterContent({
	activeFilters,
	onToggleFilter,
	hasActiveInstallations,
}: DashboardFilterContentProps): JSX.Element {
	const { portalRef } = usePortalContext();

	const filterList: readonly DashboardFilterType[] =
		hasActiveInstallations || activeFilters.has("installing")
			? (["installing", ...BASE_FILTERS] as const)
			: BASE_FILTERS;

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="end"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={5}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{filterList.map((f): JSX.Element => (
					<DropdownMenu.CheckboxItem
						key={f}
						checked={activeFilters.has(f)}
						className="ce-dropdown-checkbox-item"
						onCheckedChange={(): void => {
							onToggleFilter(f);
						}}
					>
						{f.charAt(0).toUpperCase() + f.slice(1)}
						<DropdownMenu.ItemIndicator>
							<Icon className="ce-check-icon" name="check" />
						</DropdownMenu.ItemIndicator>
					</DropdownMenu.CheckboxItem>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}
