import { Suspense, type JSX, type ChangeEvent, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/ui/components/Icon";
import { lazyWithPreload } from "@/utils/lazyWithPreload";
import type { CEHeaderMenuContentProps } from "./CEHeaderMenuContent";

export type Section = "General" | "Dashboard";

interface CEHeaderProps {
	readonly activeSection: Section;
	readonly onSectionChange: (section: Section) => void;
	readonly isSearchVisible?: boolean;
	readonly onSearchToggle?: () => void;
	readonly searchQuery?: string;
	readonly onSearchChange?: (query: string) => void;
	readonly onAdd?: (() => void) | undefined;
	readonly onTitleClick?: (() => void) | undefined;
	readonly onRowBottomClick?: (() => void) | undefined;
	readonly titleOverride?: string | undefined;
	readonly actions?: ReactNode;
	readonly info?: ReactNode;
}

const LazyCEHeaderMenuContent = lazyWithPreload<CEHeaderMenuContentProps>(async () => {
	const mod = await import("./CEHeaderMenuContent");
	return { default: mod.CEHeaderMenuContent };
});

export function CEHeader(props: CEHeaderProps): JSX.Element {
	const {
		activeSection,
		onSectionChange,
		isSearchVisible,
		onSearchToggle,
		searchQuery,
		onSearchChange,
		onAdd,
		onTitleClick,
		onRowBottomClick,
		titleOverride,
		actions,
		info,
	} = props;
	const showSearch = isSearchVisible ?? false;
	const currentSearchQuery = searchQuery ?? "";
	const displayTitle = titleOverride ?? activeSection;

	return (
		<div className="ce-settings-header-wrapper">
			{showSearch && onSearchToggle !== undefined && onSearchChange !== undefined ? (
				<div className="ce-header-search-overlay">
					<Icon className="ce-header-search-icon" name="search" />
					<input
						autoFocus
						className="ce-header-search-input"
						placeholder={`Search ${activeSection}...`}
						value={currentSearchQuery}
						onChange={(e: ChangeEvent<HTMLInputElement>): void => {
							onSearchChange(e.target.value);
						}}
					/>
					<button
						aria-label="Close Search"
						className="ce-search-close-btn"
						type="button"
						onClick={onSearchToggle}
					>
						<Icon name="cross" />
					</button>
				</div>
			) : null}

			<div className="ce-header-row-top">
				<div className="ce-header-left">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger asChild>
							<button
								aria-label="Menu"
								className="ce-hamburger-btn"
								type="button"
								onFocus={(): void => {
									void LazyCEHeaderMenuContent.preload();
								}}
								onPointerDown={(): void => {
									void LazyCEHeaderMenuContent.preload();
								}}
								onPointerEnter={(): void => {
									void LazyCEHeaderMenuContent.preload();
								}}
							>
								<Icon name="menu" />
							</button>
						</DropdownMenu.Trigger>

						<Suspense fallback={null}>
							<LazyCEHeaderMenuContent
								activeSection={activeSection}
								onSectionChange={onSectionChange}
							/>
						</Suspense>
					</DropdownMenu.Root>
				</div>

				<div className="ce-header-right">
					{actions}

					{onAdd !== undefined ? (
						<button
							aria-label="Install Plugin"
							className="ce-hamburger-btn"
							type="button"
							onClick={onAdd}
						>
							<Icon name="plus" />
						</button>
					) : null}

					{onSearchToggle !== undefined ? (
						<button
							aria-label="Search"
							className={clsx("clickable-icon", showSearch && "is-active")}
							type="button"
							onClick={onSearchToggle}
						>
							<Icon name="search" />
						</button>
					) : null}
				</div>
			</div>

			<div
				className={clsx(
					"ce-header-row-bottom",
					onRowBottomClick !== undefined && "is-interactive"
				)}
				role={onRowBottomClick !== undefined ? "button" : undefined}
				tabIndex={onRowBottomClick !== undefined ? 0 : undefined}
				onClick={onRowBottomClick}
				onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>): void => {
					if (onRowBottomClick !== undefined && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						onRowBottomClick();
					}
				}}
			>
				<h2 className="ce-section-title">
					{onTitleClick !== undefined ? (
						<button
							className="ce-title-toggle-btn"
							type="button"
							onClick={(e): void => {
								e.stopPropagation();
								onTitleClick();
							}}
						>
							{displayTitle}
						</button>
					) : (
						displayTitle
					)}
				</h2>
				{info !== undefined ? (
					<div className="ce-header-info-text">
						{info}
					</div>
				) : null}
			</div>
		</div>
	);
}
