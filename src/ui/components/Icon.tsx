import { clsx } from "clsx";
import { setIcon } from "obsidian";
import { useCallback, useEffect, useRef } from "react";
import type { JSX, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

export interface IconProps {
	readonly name: string;
	readonly className?: string | undefined;
	readonly onClick?: ((e: ReactMouseEvent<HTMLSpanElement>) => void) | undefined;
	readonly ariaLabel?: string | undefined;
}

export function Icon({ name: iconName, className, onClick, ariaLabel }: Readonly<IconProps>): JSX.Element {
	const ref = useRef<HTMLSpanElement>(null);
	const isInteractive = onClick !== undefined;

	useEffect((): void => {
		const node = ref.current;
		if (node !== null) {
			node.replaceChildren();
			setIcon(node, iconName);
		}
	}, [iconName]);

	const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLSpanElement>): void => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			ref.current?.click();
		}
	}, []);

	return (
		<span
			ref={ref}
			aria-label={ariaLabel}
			className={clsx(className)}
			role={isInteractive ? "button" : undefined}
			tabIndex={isInteractive ? 0 : undefined}
			onClick={onClick}
			onKeyDown={isInteractive ? handleKeyDown : undefined}
		/>
	);
}
