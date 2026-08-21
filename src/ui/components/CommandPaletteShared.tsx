import {
	forwardRef,
	useEffect,
	useRef,
	type JSX,
	type ReactNode,
	type RefObject,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Command } from "cmdk";
import { clsx } from "clsx";

import { BasePanel } from "@/ui/components/BasePanel";
import { Icon } from "@/ui/components/Icon";
import { CommandInstructionBar } from "@/ui/components/CommandInstructionBar";
import { safe } from "@/utils/safe";

export interface CommandPaletteHeaderInputProps {
	readonly value: string;
	readonly placeholder: string;
	readonly onValueChange: (value: string) => void;
	readonly onKeyDown?: ((e: ReactKeyboardEvent<HTMLInputElement>) => void) | undefined;
	readonly onClearAction: () => void;
	readonly clearAriaLabel: string;
	readonly clearIconName?: string | undefined;
}

export const CommandPaletteHeaderInput = forwardRef<HTMLInputElement, CommandPaletteHeaderInputProps>(
	(props, ref): JSX.Element => {
		const {
			value,
			placeholder,
			onValueChange,
			onKeyDown,
			onClearAction,
			clearAriaLabel,
			clearIconName,
		} = props;

		const finalClearIconName = clearIconName ?? "x";

		return (
			<div className="ce-command-palette-input-wrapper">
				<Icon className="ce-command-palette-icon" name="search" />
				<Command.Input
					ref={ref}
					asChild
					value={value}
					onKeyDown={onKeyDown}
					onValueChange={onValueChange}
				>
					<input
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						className="ce-command-palette-input"
						placeholder={placeholder}
						spellCheck={false}
						type="text"
					/>
				</Command.Input>
				<button
					aria-label={clearAriaLabel}
					className="ce-command-palette-clear-btn"
					type="button"
					onClick={onClearAction}
				>
					<Icon className="ce-command-palette-clear-icon" name={finalClearIconName} />
				</button>
			</div>
		);
	},
);
CommandPaletteHeaderInput.displayName = "CommandPaletteHeaderInput";

export interface CommandPaletteEmptyProps {
	readonly title: string;
	readonly height: number;
}

export function CommandPaletteEmpty({ title, height }: CommandPaletteEmptyProps): JSX.Element {
	return (
		<Command.Empty className="ce-command-palette-empty" style={{ height }}>
			<Icon className="ce-empty-icon" name="search-slash" />
			<span className="ce-empty-title">{title}</span>
		</Command.Empty>
	);
}

export interface SelectorTriggerButtonProps {
	readonly label: string;
	readonly ariaLabel: string;
	readonly disabled?: boolean | undefined;
	readonly onClick?: (() => void) | undefined;
	readonly className?: string | undefined;
	readonly nameClassName?: string | undefined;
	readonly chevronClassName?: string | undefined;
}

export const SelectorTriggerButton = forwardRef<HTMLButtonElement, SelectorTriggerButtonProps>(
	(props, ref): JSX.Element => {
		const {
			label,
			ariaLabel,
			disabled,
			onClick,
			className,
			nameClassName,
			chevronClassName,
		} = props;

		const isDisabled = disabled ?? false;
		const finalClassName = className ?? "ce-version-card";
		const finalNameClassName = nameClassName ?? "ce-version-name";
		const finalChevronClassName = chevronClassName ?? "ce-version-chevron";

		return (
			<button
				ref={ref}
				aria-label={ariaLabel}
				className={clsx(finalClassName)}
				disabled={isDisabled}
				type="button"
				onClick={onClick}
			>
				<span className={clsx(finalNameClassName)}>{label}</span>
				<Icon className={clsx(finalChevronClassName)} name="more-vertical" />
			</button>
		);
	},
);
SelectorTriggerButton.displayName = "SelectorTriggerButton";

export function useModalFocusOnOpen(
	isOpen: boolean,
	inputRef: RefObject<HTMLInputElement | null>,
): void {
	useEffect((): void => {
		if (isOpen === true) {
			window.requestAnimationFrame((): void => {
				safe.try((): void => {
					inputRef.current?.focus();
				});
			});
		}
	}, [isOpen, inputRef]);
}

export interface VirtualizedCommandModalProps {
	readonly isOpen: boolean;
	readonly label: string;
	readonly activeValue: string;
	readonly placeholder: string;
	readonly searchQuery: string;
	readonly clearAriaLabel: string;
	readonly clearIconName?: string | undefined;
	readonly instructionAriaLabel?: string | undefined;
	readonly dismissLabel?: string | undefined;
	readonly totalResults: number;
	readonly activeIndex: number;
	readonly className?: string | undefined;
	readonly onClose: () => void;
	readonly onClearAction: () => void;
	readonly onKeyDown?: ((e: ReactKeyboardEvent<HTMLInputElement>) => void) | undefined;
	readonly onSearchQueryChange: (query: string) => void;
	readonly listContent: ReactNode;
	readonly inputRef?: RefObject<HTMLInputElement | null> | undefined;
}

export function VirtualizedCommandModal(props: VirtualizedCommandModalProps): JSX.Element | null {
	const {
		isOpen,
		label,
		activeValue,
		placeholder,
		searchQuery,
		clearAriaLabel,
		clearIconName,
		instructionAriaLabel,
		dismissLabel,
		totalResults,
		activeIndex,
		className,
		onClose,
		onClearAction,
		onKeyDown,
		onSearchQueryChange,
		listContent,
		inputRef: externalInputRef,
	} = props;

	const internalInputRef = useRef<HTMLInputElement>(null);
	const targetInputRef = externalInputRef ?? internalInputRef;

	useModalFocusOnOpen(isOpen, targetInputRef);

	if (isOpen === false) {
		return null;
	}

	return (
		<BasePanel centered isOpen={isOpen} className={className} onClose={onClose}>
			<div className="ce-command-palette-card">
				<Command label={label} shouldFilter={false} value={activeValue}>
					<CommandPaletteHeaderInput
						ref={targetInputRef}
						clearAriaLabel={clearAriaLabel}
						clearIconName={clearIconName}
						placeholder={placeholder}
						value={searchQuery}
						onClearAction={onClearAction}
						onKeyDown={onKeyDown}
						onValueChange={onSearchQueryChange}
					/>

					<Command.List className="ce-command-palette-list" role="listbox">
						{listContent}
					</Command.List>

					<CommandInstructionBar
						activeIndex={activeIndex}
						ariaLabel={instructionAriaLabel}
						dismissLabel={dismissLabel}
						totalResults={totalResults}
					/>
				</Command>
			</div>
		</BasePanel>
	);
}
