import { Suspense, type JSX } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/ui/components/Icon";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { SelectDropdownContentProps } from "@/ui/components/SelectDropdownContent";

export interface SelectDropdownOption<T extends string> {
	readonly value: T;
	readonly label: string;
}

export interface SelectDropdownProps<T extends string> {
	readonly value: T;
	readonly options: readonly SelectDropdownOption<T>[];
	readonly onChange: (value: T) => void;
	readonly ariaLabel: string;
	readonly disabled?: boolean | undefined;
	readonly align?: "start" | "center" | "end" | undefined;
	readonly className?: string | undefined;
}

const LazySelectDropdownContent = lazyWithPreload<SelectDropdownContentProps<string>>(async () => {
	const mod = await import("./SelectDropdownContent");
	return { default: mod.SelectDropdownContent };
});

export function SelectDropdown<T extends string>(props: SelectDropdownProps<T>): JSX.Element {
	const { value, options, onChange, ariaLabel, disabled, align, className } = props;
	const finalAlign = align ?? "end";
	const isDisabled = disabled ?? false;

	const currentOption = options.find((opt): boolean => opt.value === value);
	const displayValue = currentOption !== undefined ? currentOption.label : String(value);

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button
					aria-label={ariaLabel}
					className={clsx("ce-version-card", className)}
					disabled={isDisabled}
					type="button"
					onFocus={(): void => {
						void LazySelectDropdownContent.preload();
					}}
					onPointerDown={(): void => {
						void LazySelectDropdownContent.preload();
					}}
					onPointerEnter={(): void => {
						void LazySelectDropdownContent.preload();
					}}
				>
					<span className="ce-version-name">{displayValue}</span>
					<Icon className="ce-version-chevron" name="more-vertical" />
				</button>
			</DropdownMenu.Trigger>

			<Suspense fallback={null}>
				<LazySelectDropdownContent
					align={finalAlign}
					options={options}
					value={value}
					onChange={(val: string): void => {
						onChange(val as T);
					}}
				/>
			</Suspense>
		</DropdownMenu.Root>
	);
}
