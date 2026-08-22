import { cva } from "class-variance-authority";
import { clsx } from "clsx";

import { Icon } from "@/ui/components/Icon";

import type {
	JSX,
	Ref,
	ButtonHTMLAttributes,
	InputHTMLAttributes,
	ChangeEvent,
	KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { VariantProps } from "class-variance-authority";
import type { ClassValue } from "clsx";

function cn(...inputs: ClassValue[]): string {
	return clsx(inputs);
}

const buttonVariants = cva("mod-button", {
	variants: {
		variant: {
			default: "",
			cta: "mod-cta",
			warning: "mod-warning",
			destructive: "mod-warning mod-destructive",
		},
		size: {
			default: "",
			sm: "mod-sm",
		},
		fullWidth: {
			true: "ce-full-width-btn",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "default",
		fullWidth: false,
	},
});

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	readonly text: string;
	readonly icon?: string | undefined;
	readonly ref?: Ref<HTMLButtonElement> | undefined;
}

export function Button(props: ButtonProps): JSX.Element {
	const { ref, className, variant, size, fullWidth, text, icon, type, onClick, ...restProps } = props;
	const buttonType = type ?? "button";
	const buttonClassName = cn(buttonVariants({ variant, size, fullWidth }), className);
	const iconElement = icon !== undefined ? <Icon className="button-icon" name={icon} /> : null;

	if (buttonType === "submit") {
		return (
			<button ref={ref} className={buttonClassName} type="submit" onClick={onClick} {...restProps}>
				{iconElement}
				{text}
			</button>
		);
	}

	if (buttonType === "reset") {
		return (
			<button ref={ref} className={buttonClassName} type="reset" onClick={onClick} {...restProps}>
				{iconElement}
				{text}
			</button>
		);
	}

	return (
		<button ref={ref} className={buttonClassName} type="button" onClick={onClick} {...restProps}>
			{iconElement}
			{text}
		</button>
	);
}

export function Toggle({
	checked: isChecked,
	onChange,
}: {
	readonly checked: boolean;
	readonly onChange: (checked: boolean) => void;
}): JSX.Element {
	return (
		<div
			aria-checked={isChecked}
			className={cn("checkbox-container", isChecked ? "is-enabled" : "")}
			role="switch"
			tabIndex={0}
			onClick={(): void => {
				onChange(!isChecked);
			}}
			onKeyDown={(e: ReactKeyboardEvent): void => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onChange(!isChecked);
				}
			}}
		>
			<input readOnly checked={isChecked} tabIndex={-1} type="checkbox" />
		</div>
	);
}

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
	readonly value: number;
	readonly min: number;
	readonly max: number;
	readonly step?: number;
	readonly onChange: (value: number) => void;
	readonly ref?: Ref<HTMLInputElement> | undefined;
}

export function Slider(props: SliderProps): JSX.Element {
	const { ref, className, value, min, max, step, onChange, ...restProps } = props;
	const inputStep = step ?? 1;
	return (
		<input
			ref={ref}
			className={cn("slider", className)}
			max={max}
			min={min}
			step={inputStep}
			type="range"
			value={value}
			onChange={(e: ChangeEvent<HTMLInputElement>): void => {
				onChange(Number(e.target.value));
			}}
			{...restProps}
		/>
	);
}
