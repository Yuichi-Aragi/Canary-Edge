import { useRef, useCallback, Suspense } from "react";
import { clsx } from "clsx";

import { SelectorTriggerButton } from "@/ui/components/CommandPaletteShared";
import { useSecretSelectorViewModel } from "@/ui/hooks/useSecretSelectorViewModel";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

import type { JSX, RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type {
	SecretSelectorViewState,
	SecretSelectorViewActions,
} from "@/ui/hooks/useSecretSelectorViewModel";
import type { SecretSelectorModalProps } from "@/ui/components/SecretSelectorModal";

export interface SecretSelectorProps {
	readonly value: string;
	readonly options: readonly string[];
	readonly onChange: (value: string) => void;
	readonly disabled?: boolean | undefined;
	readonly isValidating?: boolean | undefined;
	readonly compact?: boolean | undefined;
}

const LazySecretSelectorModal = lazyWithPreload<SecretSelectorModalProps>(async () => {
	const mod = await import("@/ui/components/SecretSelectorModal");
	return { default: mod.SecretSelectorModal };
});

interface SecretSelectorViewProps {
	readonly value: string;
	readonly disabled?: boolean | undefined;
	readonly isValidating?: boolean | undefined;
	readonly compact?: boolean | undefined;
	readonly state: SecretSelectorViewState;
	readonly actions: SecretSelectorViewActions;
	readonly virtuosoRef: RefObject<VirtuosoHandle | null>;
}

function SecretSelectorView(props: SecretSelectorViewProps): JSX.Element {
	const {
		value,
		disabled,
		isValidating,
		compact,
		state,
		actions,
		virtuosoRef,
	} = props;

	const isDisabled = disabled ?? false;
	const checkingValidity = isValidating ?? false;
	const isCompact = compact ?? false;

	const handleItemSelect = useCallback(
		(opt: string): void => {
			actions.handleSelect(opt);
			actions.closeModal();
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

	const displayLabel = checkingValidity ? "Validating..." : state.displayValue;

	return (
		<div className={clsx("ce-pat-container", isCompact ? "mod-compact" : "")}>
			<SelectorTriggerButton
				ariaLabel="Select GitHub PAT Secret"
				chevronClassName="ce-secret-chevron"
				className="ce-secret-card"
				disabled={isDisabled}
				label={displayLabel}
				nameClassName="ce-secret-name"
				onClick={actions.openModal}
			/>

			{state.isOpen ? (
				<Suspense fallback={null}>
					<LazySecretSelectorModal
						activeIndex={state.activeIndex}
						activeValue={state.activeValue}
						isOpen={state.isOpen}
						listData={state.listData}
						listHeight={state.listHeight}
						searchQuery={state.searchQuery}
						value={value}
						virtuosoRef={virtuosoRef}
						onClearAction={handleHeaderActionClick}
						onClose={actions.closeModal}
						onKeyDown={(e): void => {
							actions.handleKeyDown(e);
						}}
						onMouseEnter={actions.handleItemMouseEnter}
						onSearchQueryChange={actions.setSearchQuery}
						onSelect={handleItemSelect}
					/>
				</Suspense>
			) : null}
		</div>
	);
}

export function SecretSelector(props: SecretSelectorProps): JSX.Element {
	const { value, options, onChange, disabled, isValidating, compact } = props;
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const vm = useSecretSelectorViewModel({
		value,
		options,
		onChange,
		virtuosoRef,
	});

	return (
		<SecretSelectorView
			actions={vm.actions}
			compact={compact}
			disabled={disabled}
			isValidating={isValidating}
			state={vm.state}
			value={value}
			virtuosoRef={virtuosoRef}
		/>
	);
}
