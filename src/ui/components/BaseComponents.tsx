import {
	forwardRef,
	type JSX,
	type ButtonHTMLAttributes,
	type InputHTMLAttributes,
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { Icon } from "./Icon";

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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(props, ref): JSX.Element => {
		const { className, variant, size, fullWidth, text, icon, type, onClick, ...restProps } = props;
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
	},
);
Button.displayName = "Button";

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
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
	(props, ref): JSX.Element => {
		const { className, value, min, max, step, onChange, ...restProps } = props;
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
	},
);
Slider.displayName = "Slider";
