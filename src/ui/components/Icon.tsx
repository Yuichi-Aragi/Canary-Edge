import { setIcon } from "obsidian";
import { useEffect, useRef, useCallback, type JSX, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { clsx } from "clsx";

interface IconProps {
	readonly name: string;
	readonly className?: string | undefined;
	readonly onClick?: ((e: ReactMouseEvent) => void) | undefined;
	readonly ariaLabel?: string | undefined;
}

export function Icon({ name: iconName, className, onClick, ariaLabel }: IconProps): JSX.Element {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect((): void => {
		if (ref.current !== null) {
			ref.current.innerHTML = "";
			setIcon(ref.current, iconName);
		}
	}, [iconName]);

	const handleKeyDown = useCallback((e: ReactKeyboardEvent): void => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick?.(e as unknown as ReactMouseEvent);
		}
	}, [onClick]);

	return (
		<span
			ref={ref}
			aria-label={ariaLabel}
			className={clsx(className)}
			role={onClick !== undefined ? "button" : undefined}
			tabIndex={onClick !== undefined ? 0 : undefined}
			onClick={onClick}
			onKeyDown={onClick !== undefined ? handleKeyDown : undefined}
		/>
	);
}
