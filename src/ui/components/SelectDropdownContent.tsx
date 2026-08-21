import type { JSX } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { usePortalContext } from "@/ui/context/PortalContext";

import type { SelectDropdownOption } from "@/ui/components/SelectDropdown";

export interface SelectDropdownContentProps<T extends string> {
	readonly value: T;
	readonly options: readonly SelectDropdownOption<T>[];
	readonly align: "start" | "center" | "end";
	readonly onChange: (value: T) => void;
}

export function SelectDropdownContent<T extends string>(props: SelectDropdownContentProps<T>): JSX.Element {
	const { portalRef } = usePortalContext();
	const { value, options, align, onChange } = props;

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align={align}
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={8}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{options.map((option): JSX.Element => (
					<DropdownMenu.Item
						key={option.value}
						className={clsx(
							"ce-dropdown-item",
							value === option.value ? "is-active" : ""
						)}
						onSelect={(): void => {
							onChange(option.value);
						}}
					>
						{option.label}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}
