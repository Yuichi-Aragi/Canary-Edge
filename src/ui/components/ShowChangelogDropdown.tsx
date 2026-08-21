import type { JSX } from "react";
import { SelectDropdown, type SelectDropdownOption } from "@/ui/components/SelectDropdown";
import type { ChangelogPriority, ShowChangelogMode } from "@/domain/types";

export interface ShowChangelogDropdownProps {
	readonly value: ShowChangelogMode;
	readonly onChange: (value: ShowChangelogMode) => void;
	readonly disabled?: boolean | undefined;
	readonly align?: "start" | "center" | "end" | undefined;
}

export interface ChangelogPriorityDropdownProps {
	readonly value: ChangelogPriority;
	readonly onChange: (value: ChangelogPriority) => void;
	readonly disabled?: boolean | undefined;
	readonly align?: "start" | "center" | "end" | undefined;
}

const CHANGELOG_MODE_OPTIONS: readonly SelectDropdownOption<ShowChangelogMode>[] = [
	{ value: "before", label: "Before install/update" },
	{ value: "after", label: "After install/update" },
];

const CHANGELOG_PRIORITY_OPTIONS: readonly SelectDropdownOption<ChangelogPriority>[] = [
	{ value: "release_notes", label: "Release notes (fallback to changelog file)" },
	{ value: "changelog_file", label: "Changelog file (fallback to release notes)" },
];

export function ShowChangelogDropdown(props: ShowChangelogDropdownProps): JSX.Element {
	const { value, onChange, disabled, align } = props;

	return (
		<SelectDropdown<ShowChangelogMode>
			align={align}
			ariaLabel="Select Show Changelog Mode"
			disabled={disabled}
			options={CHANGELOG_MODE_OPTIONS}
			value={value}
			onChange={onChange}
		/>
	);
}

export function ChangelogPriorityDropdown(props: ChangelogPriorityDropdownProps): JSX.Element {
	const { value, onChange, disabled, align } = props;

	return (
		<SelectDropdown<ChangelogPriority>
			align={align}
			ariaLabel="Select Changelog Source Priority"
			disabled={disabled}
			options={CHANGELOG_PRIORITY_OPTIONS}
			value={value}
			onChange={onChange}
		/>
	);
}
