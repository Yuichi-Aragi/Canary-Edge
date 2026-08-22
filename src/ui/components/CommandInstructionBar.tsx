import { memo, type JSX } from "react";
import { Platform } from "obsidian";

export interface CommandInstructionBarProps {
	readonly totalResults: number;
	readonly activeIndex: number;
	readonly dismissLabel?: string | undefined;
	readonly ariaLabel?: string | undefined;
}

export const CommandInstructionBar = memo(
	(props: CommandInstructionBarProps): JSX.Element => {
		const { totalResults, activeIndex, dismissLabel, ariaLabel } = props;
		const finalDismissLabel = dismissLabel ?? "Dismiss";
		const finalAriaLabel = ariaLabel ?? "Navigation guide";

		const { isMobile, isMacOS: isMac } = Platform;

		if (isMobile) {
			return (
				<div
					aria-label={finalAriaLabel}
					className="ce-command-palette-instruction-bar"
					role="note"
				>
					<span className="ce-command-instruction-item">Tap item to select</span>
					<span className="ce-command-instruction-item">Swipe to scroll</span>
					{totalResults > 0 && activeIndex >= 0 ? (
						<span
							aria-label={`Item ${String(activeIndex + 1)} of ${String(totalResults)}`}
							className="ce-command-count"
						>
							{activeIndex + 1} of {totalResults}
						</span>
					) : null}
				</div>
			);
		}

		return (
			<div
				aria-label={finalAriaLabel}
				className="ce-command-palette-instruction-bar"
				role="note"
			>
				<span className="ce-command-instruction-item">
					<kbd className="ce-kbd">↑</kbd>
					<kbd className="ce-kbd">↓</kbd>
					<span>Navigate</span>
				</span>
				<span className="ce-command-instruction-item">
					<kbd className="ce-kbd">{isMac ? "↵" : "Enter"}</kbd>
					<span>Select</span>
				</span>
				<span className="ce-command-instruction-item">
					<kbd className="ce-kbd">{isMac ? "⎋" : "Esc"}</kbd>
					<span>{finalDismissLabel}</span>
				</span>
				{totalResults > 0 && activeIndex >= 0 ? (
					<span
						aria-label={`Item ${String(activeIndex + 1)} of ${String(totalResults)}`}
						className="ce-command-count"
					>
						{activeIndex + 1} of {totalResults}
					</span>
				) : null}
			</div>
		);
	}
);
CommandInstructionBar.displayName = "CommandInstructionBar";
