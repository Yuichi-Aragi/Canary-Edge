import {
	memo,
	useCallback,
	useMemo,
	type JSX,
	type RefObject,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Command } from "cmdk";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { clsx } from "clsx";

import { Icon } from "@/ui/components/Icon";
import {
	CommandPaletteEmpty,
	VirtualizedCommandModal,
} from "@/ui/components/CommandPaletteShared";

import type { IndexedReleaseVersion } from "@/ui/hooks/useVersionSelectorViewModel";

interface VersionSelectorItemProps {
	readonly versionItem: IndexedReleaseVersion;
	readonly index: number;
	readonly isSelected: boolean;
	readonly isCurrentValue: boolean;
	readonly isLoadingMore: boolean;
	readonly errorMessage: string | null;
	readonly onMouseEnter: (index: number) => void;
	readonly onSelect: (val: string) => void;
}

const VersionSelectorLoadMoreItem = memo(
	({
		index,
		isSelected,
		isLoadingMore,
		onMouseEnter,
		onSelect,
	}: Omit<VersionSelectorItemProps, "versionItem" | "isCurrentValue" | "errorMessage">): JSX.Element => {
		const handleMouseEnter = useCallback((): void => {
			onMouseEnter(index);
		}, [onMouseEnter, index]);

		const handleSelect = useCallback((): void => {
			onSelect("__LOAD_MORE__");
		}, [onSelect]);

		return (
			<Command.Item
				key="__LOAD_MORE__"
				aria-busy={isLoadingMore}
				aria-selected={isSelected}
				className={clsx(
					"ce-command-palette-load-more-item",
					isSelected === true ? "is-selected" : "",
					isLoadingMore === true ? "is-loading" : "",
				)}
				role="option"
				value="__load_more__"
				onMouseEnter={handleMouseEnter}
				onSelect={handleSelect}
			>
				<div className="ce-load-more-btn">
					<Icon
						className={clsx("ce-load-more-icon", isLoadingMore === true ? "ce-spin" : "")}
						name={isLoadingMore === true ? "loader-2" : "download"}
					/>
					<span className="ce-load-more-text">
						{isLoadingMore === true ? "Fetching additional versions..." : "Load more versions"}
					</span>
				</div>
			</Command.Item>
		);
	},
);
VersionSelectorLoadMoreItem.displayName = "VersionSelectorLoadMoreItem";

const VersionSelectorErrorRetryItem = memo(
	({
		index,
		isSelected,
		errorMessage,
		onMouseEnter,
		onSelect,
	}: Omit<VersionSelectorItemProps, "versionItem" | "isCurrentValue" | "isLoadingMore">): JSX.Element => {
		const handleMouseEnter = useCallback((): void => {
			onMouseEnter(index);
		}, [onMouseEnter, index]);

		const handleSelect = useCallback((): void => {
			onSelect("__ERROR_RETRY__");
		}, [onSelect]);

		return (
			<Command.Item
				key="__ERROR_RETRY__"
				aria-selected={isSelected}
				className={clsx(
					"ce-command-palette-load-more-item",
					"ce-command-palette-error-item",
					isSelected === true ? "is-selected" : "",
				)}
				role="option"
				value="__error_retry__"
				onMouseEnter={handleMouseEnter}
				onSelect={handleSelect}
			>
				<div className="ce-load-more-btn ce-error-btn">
					<Icon className="ce-load-more-icon ce-error-icon" name="rotate-ccw" />
					<div className="ce-error-text-container">
						<span className="ce-load-more-text">Failed to load versions. Click to retry.</span>
						{errorMessage !== null ? (
							<span className="ce-item-description ce-error-detail" title={errorMessage}>
								{errorMessage}
							</span>
						) : null}
					</div>
				</div>
			</Command.Item>
		);
	},
);
VersionSelectorErrorRetryItem.displayName = "VersionSelectorErrorRetryItem";

const VersionSelectorStandardItem = memo(
	({
		versionItem,
		index,
		isSelected,
		isCurrentValue,
		onMouseEnter,
		onSelect,
	}: Omit<VersionSelectorItemProps, "isLoadingMore" | "errorMessage">): JSX.Element => {
		const isLatest = versionItem.version === "latest";
		const label = isLatest === true ? "Latest version" : versionItem.version;
		const { badgeInfo, publishedTime } = versionItem;

		const handleMouseEnter = useCallback((): void => {
			onMouseEnter(index);
		}, [onMouseEnter, index]);

		const handleSelect = useCallback((): void => {
			onSelect(versionItem.version);
		}, [onSelect, versionItem.version]);

		return (
			<Command.Item
				key={versionItem.version}
				aria-selected={isSelected}
				className={clsx("ce-command-palette-item", isSelected === true ? "is-selected" : "")}
				role="option"
				value={versionItem.version.toLowerCase()}
				onMouseEnter={handleMouseEnter}
				onSelect={handleSelect}
			>
				<Icon className="ce-command-icon" name={badgeInfo.icon} />
				<div className="ce-item-text-wrapper">
					<div className="ce-item-header-row">
						<span className="ce-item-title">{label}</span>
						<span className={clsx("ce-version-badge", `ce-version-badge-${badgeInfo.domain}`)}>
							{badgeInfo.text}
						</span>
					</div>
					<div className="ce-item-sub-row">
						<span className="ce-item-description">{badgeInfo.description}</span>
						{publishedTime !== null ? (
							<span className="ce-item-published-time">{publishedTime}</span>
						) : null}
					</div>
				</div>
				{isCurrentValue === true ? (
					<Icon className="ce-command-palette-check-icon" name="check" />
				) : null}
			</Command.Item>
		);
	},
);
VersionSelectorStandardItem.displayName = "VersionSelectorStandardItem";

const VersionSelectorItem = memo(
	(props: VersionSelectorItemProps): JSX.Element => {
		if (props.versionItem.version === "__LOAD_MORE__") {
			return (
				<VersionSelectorLoadMoreItem
					index={props.index}
					isLoadingMore={props.isLoadingMore}
					isSelected={props.isSelected}
					onMouseEnter={props.onMouseEnter}
					onSelect={props.onSelect}
				/>
			);
		}

		if (props.versionItem.version === "__ERROR_RETRY__") {
			return (
				<VersionSelectorErrorRetryItem
					errorMessage={props.errorMessage}
					index={props.index}
					isSelected={props.isSelected}
					onMouseEnter={props.onMouseEnter}
					onSelect={props.onSelect}
				/>
			);
		}

		return <VersionSelectorStandardItem {...props} />;
	},
);
VersionSelectorItem.displayName = "VersionSelectorItem";

export interface VersionSelectorModalProps {
	readonly isOpen: boolean;
	readonly activeIndex: number;
	readonly activeValue: string;
	readonly searchQuery: string;
	readonly listData: readonly IndexedReleaseVersion[];
	readonly listHeight: number;
	readonly value: string;
	readonly isLoadingMore: boolean;
	readonly errorMessage: string | null;
	readonly virtuosoRef: RefObject<VirtuosoHandle | null>;
	readonly onClose: () => void;
	readonly onSelect: (val: string) => void;
	readonly onSearchQueryChange: (query: string) => void;
	readonly onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	readonly onMouseEnter: (index: number) => void;
	readonly onClearAction: () => void;
	readonly onLoadMore: () => void;
	readonly onRetry: () => void;
}

export function VersionSelectorModal(props: VersionSelectorModalProps): JSX.Element {
	const {
		isOpen,
		activeIndex,
		activeValue,
		searchQuery,
		listData,
		listHeight,
		value,
		isLoadingMore,
		errorMessage,
		virtuosoRef,
		onClose,
		onSelect,
		onSearchQueryChange,
		onKeyDown,
		onMouseEnter,
		onClearAction,
		onLoadMore,
		onRetry,
	} = props;

	const handleItemSelect = useCallback(
		(val: string): void => {
			if (val === "__LOAD_MORE__") {
				onLoadMore();
				return;
			}
			if (val === "__ERROR_RETRY__") {
				onRetry();
				return;
			}
			onSelect(val);
		},
		[onLoadMore, onRetry, onSelect],
	);

	const computeItemKey = useCallback((index: number, v: IndexedReleaseVersion): string => {
		return `${v.version}_${v.badgeInfo.domain}_${String(index)}`;
	}, []);

	const renderItem = useCallback(
		(index: number, v: IndexedReleaseVersion): JSX.Element => {
			const isSelected = index === activeIndex && activeIndex >= 0;
			const isCurrentValue = value === v.version;

			return (
				<VersionSelectorItem
					errorMessage={errorMessage}
					index={index}
					isCurrentValue={isCurrentValue}
					isLoadingMore={isLoadingMore}
					isSelected={isSelected}
					versionItem={v}
					onMouseEnter={onMouseEnter}
					onSelect={handleItemSelect}
				/>
			);
		},
		[activeIndex, isLoadingMore, errorMessage, value, onMouseEnter, handleItemSelect],
	);

	const listContent = useMemo((): JSX.Element => {
		if (listData.length === 0) {
			return <CommandPaletteEmpty height={listHeight} title="No matching release versions" />;
		}

		return (
			<Virtuoso
				ref={virtuosoRef}
				className="ce-command-palette-virtuoso"
				computeItemKey={computeItemKey}
				data={listData}
				increaseViewportBy={{ top: 100, bottom: 100 }}
				itemContent={renderItem}
				overscan={5}
				style={{ height: listHeight }}
				totalCount={listData.length}
			/>
		);
	}, [listData, listHeight, computeItemKey, renderItem, virtuosoRef]);

	return (
		<VirtualizedCommandModal
			activeIndex={activeIndex}
			activeValue={activeValue.toLowerCase()}
			clearAriaLabel="Clear search or dismiss panel"
			instructionAriaLabel="Version selector navigation guide"
			isOpen={isOpen}
			label="Version Selector"
			listContent={listContent}
			placeholder="Search release versions..."
			searchQuery={searchQuery}
			totalResults={listData.length}
			onClearAction={onClearAction}
			onClose={onClose}
			onKeyDown={onKeyDown}
			onSearchQueryChange={onSearchQueryChange}
		/>
	);
}
