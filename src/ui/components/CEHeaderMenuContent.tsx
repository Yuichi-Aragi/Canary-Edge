import type { JSX } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { usePortalContext } from "@/ui/context/PortalContext";
import type { Section } from "@/ui/components/CEHeader";

export interface CEHeaderMenuContentProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
}

export function CEHeaderMenuContent({ activeSection, onSectionChange }: CEHeaderMenuContentProps): JSX.Element {
	const { portalRef } = usePortalContext();

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="start"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={5}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{(["General", "Dashboard"] as const).map((section): JSX.Element => (
					<DropdownMenu.Item
						key={section}
						className={clsx(
							"ce-dropdown-item",
							activeSection === section ? "is-active" : ""
						)}
						onSelect={(): void => {
							onSectionChange(section);
						}}
					>
						{section}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}
