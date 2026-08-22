import { useCallback } from "react";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { toast } from "sonner";

import type { JSX, MouseEvent as ReactMouseEvent } from "react";
import type { CanaryToastProps, ToastVariant } from "@/ui/components/toast/types";

const toastCardVariants = cva("ce-toast-card", {
	variants: {
		variant: {
			info: "mod-info",
			success: "mod-success",
			warning: "mod-warning",
			error: "mod-error",
			loading: "mod-loading",
		},
	},
	defaultVariants: {
		variant: "info",
	},
});

export function CanaryToastCard(props: Readonly<CanaryToastProps>): JSX.Element {
	const {
		id,
		title,
		description,
		variant: rawVariant,
		action,
		cancel,
		className,
		children,
	} = props;

	const variant: ToastVariant = rawVariant ?? "info";

	const handleActionClick = useCallback(
		(e: ReactMouseEvent<HTMLButtonElement>): void => {
			e.stopPropagation();
			if (action !== undefined) {
				action.onClick(e);
			}
		},
		[action],
	);

	const handleCancelClick = useCallback(
		(e: ReactMouseEvent<HTMLButtonElement>): void => {
			e.stopPropagation();
			if (cancel !== undefined) {
				cancel.onClick(e);
			}
			toast.dismiss(id);
		},
		[cancel, id],
	);

	const isError = variant === "error";

	return (
		<div
			aria-atomic="true"
			aria-live={isError ? "assertive" : "polite"}
			className={clsx(toastCardVariants({ variant }), className)}
			data-toast-id={id}
			data-variant={variant}
			role={isError ? "alert" : "status"}
		>
			<div className="ce-toast-main-content">
				<div className="ce-toast-text-group">
					<div className="ce-toast-title">{title}</div>
					{description !== undefined && description.trim() !== "" ? (
						<div className="ce-toast-description" title={description}>
							{description}
						</div>
					) : null}
					{children}
				</div>
			</div>

			{action !== undefined || cancel !== undefined ? (
				<div className="ce-toast-actions-strip">
					{cancel !== undefined ? (
						<button
							className="ce-toast-action-btn mod-cancel"
							type="button"
							onClick={handleCancelClick}
						>
							{cancel.label}
						</button>
					) : null}
					{action !== undefined ? (
						<button
							className="ce-toast-action-btn mod-primary"
							type="button"
							onClick={handleActionClick}
						>
							{action.label}
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
