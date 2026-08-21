import { clsx } from "clsx";
import { Toaster } from "sonner";
import type { CSSProperties, JSX } from "react";
import type { CanaryToasterProps, ToastPosition } from "@/ui/components/toast/types";

const TOASTER_POSITION: ToastPosition = "top-center";
const DEFAULT_MAX_VISIBLE_TOASTS = 3;
const DEFAULT_GAP = 8;
const DEFAULT_OFFSET = 8;

const TOASTER_INLINE_STYLE: CSSProperties = {
	position: "absolute",
	top: "var(--ce-space-8)",
	left: 0,
	right: 0,
	bottom: "auto",
	width: "100%",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "flex-start",
	pointerEvents: "none",
	zIndex: 10002,
} as const;

export function CanaryToaster(props: Readonly<CanaryToasterProps>): JSX.Element {
	const {
		maxVisibleToasts: rawMaxVisibleToasts,
		gap: rawGap,
		offset: rawOffset,
		className,
	} = props;

	const maxVisibleToasts = rawMaxVisibleToasts ?? DEFAULT_MAX_VISIBLE_TOASTS;
	const gap = rawGap ?? DEFAULT_GAP;
	const offset = rawOffset ?? DEFAULT_OFFSET;

	return (
		<Toaster
			className={clsx("ce-toaster", className)}
			closeButton={false}
			containerAriaLabel="Notifications"
			dir="ltr"
			expand
			gap={gap}
			offset={offset}
			position={TOASTER_POSITION}
			richColors={false}
			style={TOASTER_INLINE_STYLE}
			swipeDirections={["left", "right"]}
			toastOptions={{
				unstyled: true,
			}}
			visibleToasts={maxVisibleToasts}
		/>
	);
}
