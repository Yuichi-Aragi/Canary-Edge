import { useCallback, type JSX, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { clsx } from "clsx";
import { Icon } from "@/ui/components/Icon";

interface WindowHeaderProps {
	readonly title: string;
	readonly onClose: () => void;
	readonly onRefresh: () => void;
	readonly isRefreshing?: boolean | undefined;
	readonly onClick?: (() => void) | undefined;
}

export function WindowHeader(props: WindowHeaderProps): JSX.Element {
	const { title, onClose, onRefresh, isRefreshing, onClick } = props;
	const isRefreshingActive = isRefreshing ?? false;

	const handleHeaderKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLDivElement>): void => {
			if (onClick !== undefined && (e.key === "Enter" || e.key === " ")) {
				e.preventDefault();
				onClick();
			}
		},
		[onClick],
	);

	const handleRefreshClick = useCallback(
		(e: ReactMouseEvent<HTMLButtonElement>): void => {
			e.stopPropagation();
			onRefresh();
		},
		[onRefresh],
	);

	const handleRefreshKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLButtonElement>): void => {
			if (e.key === "Enter" || e.key === " ") {
				e.stopPropagation();
			}
		},
		[],
	);

	const handleCloseClick = useCallback(
		(e: ReactMouseEvent<HTMLButtonElement>): void => {
			e.stopPropagation();
			onClose();
		},
		[onClose],
	);

	const handleCloseKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLButtonElement>): void => {
			if (e.key === "Enter" || e.key === " ") {
				e.stopPropagation();
			}
		},
		[],
	);

	return (
		<div
			aria-label={`${title} Header`}
			className="ce-ce-window-header ce-window-drag-handle"
			role={onClick !== undefined ? "button" : undefined}
			tabIndex={onClick !== undefined ? 0 : undefined}
			onClick={onClick}
			onKeyDown={onClick !== undefined ? handleHeaderKeyDown : undefined}
		>
			<div className="ce-ce-window-title">
				<span>{title}</span>
			</div>
			<div className="ce-ce-window-controls">
				<button
					aria-label="Refresh window"
					className={clsx("clickable-icon", isRefreshingActive && "is-loading")}
					disabled={isRefreshingActive}
					type="button"
					onClick={handleRefreshClick}
					onKeyDown={handleRefreshKeyDown}
				>
					<Icon name="refresh-cw" />
				</button>
				<button
					aria-label="Close window"
					className="clickable-icon"
					disabled={isRefreshingActive}
					type="button"
					onClick={handleCloseClick}
					onKeyDown={handleCloseKeyDown}
				>
					<Icon name="x" />
				</button>
			</div>
		</div>
	);
}
