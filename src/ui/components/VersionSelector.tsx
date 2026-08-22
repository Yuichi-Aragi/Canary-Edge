import { useRef, useEffect, useCallback, Suspense } from "react";

import { SelectorTriggerButton } from "@/ui/components/CommandPaletteShared";
import { useVersionSelectorViewModel } from "@/ui/hooks/useVersionSelectorViewModel";
import { lazyWithPreload } from "@/utils/lazyWithPreload";
import { safe } from "@/utils/safe";

import type { JSX, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { ReleaseVersion, ReleaseChannel } from "@/domain/types";
import type {
	VersionSelectorViewState,
	VersionSelectorViewActions,
} from "@/ui/hooks/useVersionSelectorViewModel";
import type { VersionSelectorModalProps } from "@/ui/components/VersionSelectorModal";

export interface VersionSelectorProps {
	readonly value: string;
	readonly versions: readonly ReleaseVersion[] | undefined;
	readonly onChange: (value: string) => void;
	readonly disabled?: boolean | undefined;
	readonly repoUrl?: string | undefined;
	readonly tokenSecretId?: string | undefined;
	readonly channel?: ReleaseChannel | undefined;
	readonly onLoadMore?: (() => Promise<void>) | undefined;
}

const LazyVersionSelectorModal = lazyWithPreload<VersionSelectorModalProps>(async () => {
	const mod = await import("@/ui/components/VersionSelectorModal");
	return { default: mod.VersionSelectorModal };
});

interface VersionSelectorViewProps {
	readonly value: string;
	readonly disabled?: boolean | undefined;
	readonly state: VersionSelectorViewState;
	readonly actions: VersionSelectorViewActions;
	readonly virtuosoRef: RefObject<VirtuosoHandle | null>;
}

function VersionSelectorView(props: VersionSelectorViewProps): JSX.Element {
	const { value, disabled, state, actions, virtuosoRef } = props;

	const isDisabled = disabled ?? false;
	const triggerBtnRef = useRef<HTMLButtonElement>(null);

	useEffect((): void => {
		if (!state.isOpen) {
			safe.try((): void => {
				triggerBtnRef.current?.focus();
			});
		}
	}, [state.isOpen]);

	const handleItemSelect = useCallback(
		(val: string): void => {
			actions.handleSelect(val);
		},
		[actions],
	);

	const handleHeaderActionClick = useCallback((): void => {
		if (state.searchQuery !== "") {
			actions.setSearchQuery("");
		} else {
			actions.closeModal();
		}
	}, [state.searchQuery, actions]);

	return (
		<>
			<SelectorTriggerButton
				ref={triggerBtnRef}
				ariaLabel="Select Release Version"
				disabled={isDisabled}
				label={state.displayValue}
				onClick={actions.openModal}
			/>

			{state.isOpen ? (
				<Suspense fallback={null}>
					<LazyVersionSelectorModal
						activeIndex={state.activeIndex}
						activeValue={state.activeValue}
						errorMessage={state.errorMessage}
						isLoadingMore={state.isLoadingMore}
						isOpen={state.isOpen}
						listData={state.listData}
						listHeight={state.listHeight}
						searchQuery={state.searchQuery}
						value={value}
						virtuosoRef={virtuosoRef}
						onClearAction={handleHeaderActionClick}
						onClose={actions.closeModal}
						onKeyDown={actions.handleKeyDown}
						onLoadMore={actions.handleLoadMore}
						onMouseEnter={actions.handleItemMouseEnter}
						onRetry={actions.handleRetry}
						onSearchQueryChange={actions.setSearchQuery}
						onSelect={handleItemSelect}
					/>
				</Suspense>
			) : null}
		</>
	);
}

export function VersionSelector(props: VersionSelectorProps): JSX.Element {
	const { value, versions, onChange, disabled, repoUrl, tokenSecretId, channel, onLoadMore } = props;
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const vm = useVersionSelectorViewModel({
		value,
		versions,
		onChange,
		virtuosoRef,
		repoUrl,
		tokenSecretId,
		channel,
		onLoadMore,
	});

	return (
		<VersionSelectorView
			actions={vm.actions}
			disabled={disabled}
			state={vm.state}
			value={value}
			virtuosoRef={virtuosoRef}
		/>
	);
}
