import { useCallback } from "react";

import { canaryToast } from "@/ui/components/toast/canaryToast";
import { useTransitionAction } from "@/ui/hooks/useTransitionAction";
import { safe } from "@/utils/safe";

interface ClipboardOptions {
	readonly label?: string | undefined;
	readonly silent?: boolean | undefined;
}

export function useClipboard(): {
	readonly copy: (text: string, options?: Readonly<ClipboardOptions>) => void;
	readonly isPending: boolean;
} {
	const { isPending, runTransition } = useTransitionAction();

	const copy = useCallback(
		(text: string, options?: Readonly<ClipboardOptions>): void => {
			runTransition(async (): Promise<void> => {
				const label = options?.label ?? "Text";
				const silent = options?.silent ?? false;

				const res = await safe.tryAsync((): Promise<void> => {
					return navigator.clipboard.writeText(text);
				});

				if (!res.ok) {
					console.error(`Failed to copy ${label} to clipboard`, res.error);
					if (!silent) {
						canaryToast.error(`Failed to copy ${label}`);
					}
				} else if (!silent) {
					const description = text.length > 50 ? `${text.slice(0, 47)}...` : text;
					canaryToast.success(`Copied ${label} to clipboard`, {
						description,
					});
				}
			});
		},
		[runTransition],
	);

	return { copy, isPending };
}
