import type { JSX } from "react";
import { SelectDropdown, type SelectDropdownOption } from "@/ui/components/SelectDropdown";
import type { ReleaseChannel } from "@/domain/types";

export interface ReleaseChannelDropdownProps {
	readonly value: ReleaseChannel;
	readonly onChange: (value: ReleaseChannel) => void;
	readonly disabled?: boolean | undefined;
	readonly align?: "start" | "center" | "end" | undefined;
}

const RELEASE_CHANNEL_OPTIONS: readonly SelectDropdownOption<ReleaseChannel>[] = [
	{ value: "stable", label: "Stable" },
	{ value: "beta", label: "Beta" },
	{ value: "canary", label: "Canary" },
];

export function ReleaseChannelDropdown(props: ReleaseChannelDropdownProps): JSX.Element {
	const { value, onChange, disabled, align } = props;

	return (
		<SelectDropdown<ReleaseChannel>
			align={align}
			ariaLabel="Select Release Channel"
			disabled={disabled}
			options={RELEASE_CHANNEL_OPTIONS}
			value={value}
			onChange={onChange}
		/>
	);
}
