import type { JSX, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Icon } from "@/ui/components/Icon";
import { Button } from "@/ui/components/BaseComponents";

const stateContainerVariants = cva("ce-state-container", {
	variants: {
		type: {
			loading: "",
			error: "ce-state-error",
			empty: ""
		}
	},
	defaultVariants: {
		type: "empty"
	}
});

interface StateContainerProps extends VariantProps<typeof stateContainerVariants> {
	readonly type: "loading" | "error" | "empty";
	readonly title?: string | undefined;
	readonly message: string;
	readonly icon?: string | undefined;
	readonly onRetry?: (() => void) | undefined;
	readonly className?: string | undefined;
	readonly children?: ReactNode | undefined;
}

function resolveDisplayMessage(message: string, type: "loading" | "error" | "empty"): string {
	const trimmed = message.trim();
	if (trimmed !== "") {
		return trimmed;
	}
	if (type === "loading") {
		return "Please wait while operation completes...";
	}
	return "No items available.";
}

export function StateContainer({
	type,
	title,
	message,
	icon,
	onRetry,
	className,
	children
}: StateContainerProps): JSX.Element {
	const getIconName = (): string | undefined => {
		if (type === "loading") {
			return undefined;
		}
		if (type === "error") {
			return "alert-triangle";
		}
		return "info";
	};

	const defaultIcon = getIconName();
	const displayTitle = title ?? (type === "loading" ? "Loading" : undefined);
	const displayMessage = resolveDisplayMessage(message, type);

	return (
		<div className={stateContainerVariants({ type, className })}>
			{type === "loading" ? (
				<div className="ce-install-spinner ce-state-icon" />
			) : (
				<Icon className="ce-state-icon" name={icon ?? defaultIcon ?? "info"} />
			)}
			
			{displayTitle !== undefined ? <div className="ce-state-title">{displayTitle}</div> : null}
			<span className="ce-state-message">{displayMessage}</span>
			
			{onRetry !== undefined ? (
				<Button 
					className="mt-4"
					text="Try Again" 
					variant="cta" 
					onClick={onRetry} 
				/>
			) : null}

			{children === undefined ? null : children}
		</div>
	);
}
