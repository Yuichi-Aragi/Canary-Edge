import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

import { safe } from "@/utils/safe";

const activeLocks = new Set<string>();

function updateBodyClass(): void {
	const res = safe.try((): void => {
		if (typeof activeDocument === "undefined" || activeDocument.body === null) {
			return;
		}
		if (activeLocks.size > 0) {
			activeDocument.body.classList.add("ce-menu-interacting");
		} else {
			activeDocument.body.classList.remove("ce-menu-interacting");
		}
	});

	if (res.ok === false) {
		console.error("Failed to update workspace menu lock body class:", res.error);
	}
}

export function useWorkspaceMenuLock(isOpen: boolean): void {
	const idRef = useRef<string | null>(null);

	useEffect((): (() => void) => {
		idRef.current = idRef.current ?? uuidv4();
		const lockId = idRef.current;

		if (isOpen === true) {
			activeLocks.add(lockId);
			updateBodyClass();
		} else {
			activeLocks.delete(lockId);
			updateBodyClass();
		}

		return (): void => {
			activeLocks.delete(lockId);
			updateBodyClass();
		};
	}, [isOpen]);
}
