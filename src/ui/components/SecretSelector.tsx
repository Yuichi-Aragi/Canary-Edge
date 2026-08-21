import { useRef, useCallback, Suspense, type JSX, type RefObject } from "react";
import { clsx } from "clsx";

import { SelectorTriggerButton } from "@/ui/components/CommandPaletteShared";
import { useSecretSelectorViewModel } from "@/ui/hooks/useSecretSelectorViewModel";
import { lazyWithPreload } from "@/utils/lazyWithPreload";

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
	readonly align?: "start" | "center" | "end" | undefined;
}

const LazySecretSelectorModal = lazyWithPreload<SecretSelectorModalProps>(async () => {
	const mod = await import("@/ui/components/SecretSelectorModal");
	return { default: mod.SecretSelectorModal };
});

interface SecretSelectorViewProps extends Omit<SecretSelectorProps, "options" | "onChange"> {
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

	const displayLabel = checkingValidity === true ? "Validating..." : state.displayValue;

	return (
		<div className={clsx("ce-pat-container", isCompact === true ? "mod-compact" : "")}>
			<SelectorTriggerButton
				ariaLabel="Select GitHub PAT Secret"
				chevronClassName="ce-secret-chevron"
				className="ce-secret-card"
				disabled={isDisabled}
				label={displayLabel}
				nameClassName="ce-secret-name"
				onClick={actions.openModal}
			/>

			{state.isOpen === true ? (
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
	const { value, options, onChange, ...rest } = props;
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const vm = useSecretSelectorViewModel({
		value,
		options,
		onChange,
		virtuosoRef,
	});

	return (
		<SecretSelectorView
			{...rest}
			actions={vm.actions}
			state={vm.state}
			value={value}
			virtuosoRef={virtuosoRef}
		/>
	);
}
