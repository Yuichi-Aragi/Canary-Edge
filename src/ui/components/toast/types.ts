import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";

export type ToastVariant = "info" | "success" | "warning" | "error" | "loading";
export type ToastPosition = "top-center";

export interface CanaryToastAction {
	readonly label: string;
	readonly onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}

export interface CanaryToastOptions {
	readonly id?: string | number | undefined;
	readonly description?: string | undefined;
	readonly duration?: number | undefined;
	readonly dismissible?: boolean | undefined;
	readonly action?: CanaryToastAction | undefined;
	readonly cancel?: CanaryToastAction | undefined;
	readonly onDismiss?: (() => void) | undefined;
	readonly onAutoClose?: (() => void) | undefined;
	readonly className?: string | undefined;
}

export interface CanaryToastProps {
	readonly id: string | number;
	readonly title: string;
	readonly description?: string | undefined;
	readonly variant?: ToastVariant | undefined;
	readonly dismissible?: boolean | undefined;
	readonly action?: CanaryToastAction | undefined;
	readonly cancel?: CanaryToastAction | undefined;
	readonly onDismiss?: (() => void) | undefined;
	readonly className?: string | undefined;
	readonly children?: ReactNode | undefined;
}

export interface CanaryToasterProps {
	readonly maxVisibleToasts?: number | undefined;
	readonly gap?: number | undefined;
	readonly offset?: number | undefined;
	readonly className?: string | undefined;
}

export interface CanaryToastPromiseOptions<T> {
	readonly loading: string;
	readonly success: string | ((data: T) => string);
	readonly error: string | ((error: unknown) => string);
	readonly description?: string | ((data: T) => string) | undefined;
	readonly errorDescription?: string | ((error: unknown) => string) | undefined;
}
