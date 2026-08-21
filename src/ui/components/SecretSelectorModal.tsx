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

interface SecretSelectorItemProps {
	readonly opt: string;
	readonly index: number;
	readonly isSelected: boolean;
	readonly isCurrentValue: boolean;
	readonly onMouseEnter: (index: number) => void;
	readonly onSelect: (val: string) => void;
}

const SecretSelectorItem = memo(
	({
		opt,
		index,
		isSelected,
		isCurrentValue,
		onMouseEnter,
		onSelect,
	}: SecretSelectorItemProps): JSX.Element => {
		const isNone = opt === "";
		const label = isNone === true ? "None" : opt;
		const description =
			isNone === true ? "Do not use a secret" : "GitHub Personal Access Token";
		const iconName = isNone === true ? "shield-off" : "key";

		const handleMouseEnter = useCallback((): void => {
			onMouseEnter(index);
		}, [onMouseEnter, index]);

		const handleSelect = useCallback((): void => {
			onSelect(opt);
		}, [onSelect, opt]);

		const itemValue = (isNone === true ? "none" : opt).toLowerCase();

		return (
			<Command.Item
				key={isNone === true ? "none" : opt}
				aria-selected={isSelected}
				className={clsx(
					"ce-command-palette-item",
					isSelected === true ? "is-selected" : "",
				)}
				role="option"
				value={itemValue}
				onMouseEnter={handleMouseEnter}
				onSelect={handleSelect}
			>
				<Icon className="ce-command-icon" name={iconName} />
				<div className="ce-item-text-wrapper">
					<span className="ce-item-title">{label}</span>
					<span className="ce-item-description">{description}</span>
				</div>
				{isCurrentValue === true ? (
					<Icon className="ce-command-palette-check-icon" name="check" />
				) : null}
			</Command.Item>
		);
	},
);
SecretSelectorItem.displayName = "SecretSelectorItem";

export interface SecretSelectorModalProps {
	readonly isOpen: boolean;
	readonly activeIndex: number;
	readonly activeValue: string;
	readonly searchQuery: string;
	readonly listData: readonly string[];
	readonly listHeight: number;
	readonly value: string;
	readonly virtuosoRef: RefObject<VirtuosoHandle | null>;
	readonly onClose: () => void;
	readonly onSelect: (opt: string) => void;
	readonly onSearchQueryChange: (query: string) => void;
	readonly onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
	readonly onMouseEnter: (index: number) => void;
	readonly onClearAction: () => void;
}

export function SecretSelectorModal(props: SecretSelectorModalProps): JSX.Element {
	const {
		isOpen,
		activeIndex,
		activeValue,
		searchQuery,
		listData,
		listHeight,
		value,
		virtuosoRef,
		onClose,
		onSelect,
		onSearchQueryChange,
		onKeyDown,
		onMouseEnter,
		onClearAction,
	} = props;

	const computeItemKey = useCallback((_index: number, opt: string): string => {
		return opt === "" ? "none" : opt;
	}, []);

	const renderItem = useCallback(
		(index: number, opt: string): JSX.Element => {
			const isSelected = index === activeIndex && activeIndex >= 0;
			const isCurrentValue = value === opt;

			return (
				<SecretSelectorItem
					index={index}
					isCurrentValue={isCurrentValue}
					isSelected={isSelected}
					opt={opt}
					onMouseEnter={onMouseEnter}
					onSelect={onSelect}
				/>
			);
		},
		[activeIndex, value, onMouseEnter, onSelect],
	);

	const listContent = useMemo((): JSX.Element => {
		if (listData.length === 0) {
			return <CommandPaletteEmpty height={listHeight} title="No secrets found" />;
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

	const activeCmdValue = (activeValue === "" ? "none" : activeValue).toLowerCase();

	return (
		<VirtualizedCommandModal
			activeIndex={activeIndex}
			activeValue={activeCmdValue}
			clearAriaLabel="Clear search or dismiss panel"
			instructionAriaLabel="Secret selector navigation guide"
			isOpen={isOpen}
			label="Secret Selector"
			listContent={listContent}
			placeholder="Search PAT secrets..."
			searchQuery={searchQuery}
			totalResults={listData.length}
			onClearAction={onClearAction}
			onClose={onClose}
			onKeyDown={onKeyDown}
			onSearchQueryChange={onSearchQueryChange}
		/>
	);
}
