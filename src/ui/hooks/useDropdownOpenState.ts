import { useCallback } from "react";

export interface UseDropdownOpenStateOptions {
	readonly menuId: string;
	readonly isScrolling?: boolean | undefined;
	readonly activeDropdownId?: string | null | undefined;
	readonly onOpenDropdown?: ((id: string | null) => void) | undefined;
}

export interface UseDropdownOpenStateResult {
	readonly isOpen: boolean;
	readonly handleOpenChange: (nextOpen: boolean) => void;
}

export function useDropdownOpenState(options: UseDropdownOpenStateOptions): UseDropdownOpenStateResult {
	const { menuId, onOpenDropdown } = options;
	const isScrolling = options.isScrolling ?? false;
	const activeDropdownId = options.activeDropdownId ?? null;

	const isOpen = activeDropdownId === menuId && isScrolling === false;

	const handleOpenChange = useCallback(
		(nextOpen: boolean): void => {
			if (isScrolling === true) {
				onOpenDropdown?.(null);
				return;
			}
			if (nextOpen === true) {
				onOpenDropdown?.(menuId);
			} else if (activeDropdownId === menuId) {
				onOpenDropdown?.(null);
			}
		},
		[isScrolling, onOpenDropdown, activeDropdownId, menuId],
	);

	return { isOpen, handleOpenChange };
}
