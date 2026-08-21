import { createElement } from "react";
import { toast } from "sonner";

import { CanaryToastCard } from "@/ui/components/toast/CanaryToastCard";

import type { ReactElement } from "react";
import type { ExternalToast } from "sonner";
import type {
	CanaryToastOptions,
	CanaryToastPromiseOptions,
	ToastPosition,
	ToastVariant,
} from "@/ui/components/toast/types";

const DEFAULT_TOAST_DURATION = 4000;
const ERROR_TOAST_DURATION = 6000;
const TOAST_INVARIANT_POSITION: ToastPosition = "top-center";

function resolveToastDuration(
	variant: ToastVariant,
	customDuration?: number,
): number {
	if (customDuration !== undefined && Number.isFinite(customDuration) === true && customDuration > 0) {
		return customDuration;
	}
	if (variant === "error") {
		return ERROR_TOAST_DURATION;
	}
	if (variant === "loading") {
		return Number.POSITIVE_INFINITY;
	}
	return DEFAULT_TOAST_DURATION;
}

function buildExternalToastOptions(
	duration: number,
	options?: Readonly<CanaryToastOptions>,
): ExternalToast {
	const externalOptions: ExternalToast = {
		duration,
		position: TOAST_INVARIANT_POSITION,
	};

	if (options?.id !== undefined) {
		externalOptions.id = options.id;
	}
	if (options?.dismissible !== undefined) {
		externalOptions.dismissible = options.dismissible;
	}
	if (options?.onDismiss !== undefined) {
		externalOptions.onDismiss = options.onDismiss;
	}
	if (options?.onAutoClose !== undefined) {
		externalOptions.onAutoClose = options.onAutoClose;
	}

	return externalOptions;
}

function createToast(
	title: string,
	variant: ToastVariant,
	options?: Readonly<CanaryToastOptions>,
): string | number {
	const duration = resolveToastDuration(variant, options?.duration);
	const externalToastOptions = buildExternalToastOptions(duration, options);

	return toast.custom(
		(toastId: string | number): ReactElement => {
			return createElement(CanaryToastCard, {
				action: options?.action,
				cancel: options?.cancel,
				className: options?.className,
				description: options?.description,
				dismissible: options?.dismissible,
				id: toastId,
				title,
				variant,
				onDismiss: options?.onDismiss,
			});
		},
		externalToastOptions,
	);
}

export function canaryToast(title: string, options?: Readonly<CanaryToastOptions>): string | number {
	return createToast(title, "info", options);
}

canaryToast.info = (title: string, options?: Readonly<CanaryToastOptions>): string | number => {
	return createToast(title, "info", options);
};

canaryToast.success = (title: string, options?: Readonly<CanaryToastOptions>): string | number => {
	return createToast(title, "success", options);
};

canaryToast.warning = (title: string, options?: Readonly<CanaryToastOptions>): string | number => {
	return createToast(title, "warning", options);
};

canaryToast.error = (title: string, options?: Readonly<CanaryToastOptions>): string | number => {
	return createToast(title, "error", options);
};

canaryToast.loading = (title: string, options?: Readonly<CanaryToastOptions>): string | number => {
	return createToast(title, "loading", options);
};

canaryToast.promise = <T,>(
	promise: Promise<T>,
	messages: Readonly<CanaryToastPromiseOptions<T>>,
	options?: Readonly<CanaryToastOptions>,
): Promise<T> => {
	const toastId = canaryToast.loading(messages.loading, {
		id: options?.id,
		className: options?.className,
		dismissible: options?.dismissible,
	});

	return promise
		.then((result: T): T => {
			const successTitle =
				typeof messages.success === "function"
					? messages.success(result)
					: messages.success;

			const successDescription =
				typeof messages.description === "function"
					? messages.description(result)
					: messages.description;

			canaryToast.success(successTitle, {
				id: toastId,
				description: successDescription,
				duration: options?.duration ?? DEFAULT_TOAST_DURATION,
				dismissible: options?.dismissible,
				action: options?.action,
				cancel: options?.cancel,
				onDismiss: options?.onDismiss,
				onAutoClose: options?.onAutoClose,
				className: options?.className,
			});

			return result;
		})
		.catch((err: unknown): never => {
			const errorTitle =
				typeof messages.error === "function"
					? messages.error(err)
					: messages.error;

			const errorDescription =
				typeof messages.errorDescription === "function"
					? messages.errorDescription(err)
					: messages.errorDescription ?? (err instanceof Error ? err.message : String(err));

			canaryToast.error(errorTitle, {
				id: toastId,
				description: errorDescription,
				duration: options?.duration ?? ERROR_TOAST_DURATION,
				dismissible: options?.dismissible,
				action: options?.action,
				cancel: options?.cancel,
				onDismiss: options?.onDismiss,
				onAutoClose: options?.onAutoClose,
				className: options?.className,
			});

			throw err;
		});
};

canaryToast.dismiss = (id?: string | number): void => {
	toast.dismiss(id);
};

canaryToast.custom = (
	render: (id: string | number) => ReactElement,
	options?: Readonly<CanaryToastOptions>,
): string | number => {
	const duration = resolveToastDuration("info", options?.duration);
	const externalToastOptions = buildExternalToastOptions(duration, options);

	return toast.custom(render, externalToastOptions);
};
