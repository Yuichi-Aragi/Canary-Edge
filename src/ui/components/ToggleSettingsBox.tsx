import type { JSX, ReactNode } from "react";
import { SettingsBox, type IconVariant } from "@/ui/components/SettingsBox";
import { Toggle } from "@/ui/components/BaseComponents";

interface ToggleSettingsBoxProps {
	readonly title: string;
	readonly description: ReactNode;
	readonly icon: string;
	readonly iconVariant: IconVariant;
	readonly checked: boolean;
	readonly onChange: (checked: boolean) => void;
	readonly isDisabled?: boolean;
	readonly globalHint?: ReactNode;
}

export function ToggleSettingsBox(props: ToggleSettingsBoxProps): JSX.Element {
	const {
		title,
		description,
		icon,
		iconVariant,
		checked,
		onChange,
		isDisabled,
		globalHint,
	} = props;
	const isToggleDisabled = isDisabled ?? false;

	return (
		<SettingsBox
			title={title}
			description={description}
			icon={icon}
			iconVariant={iconVariant}
			isDisabled={isToggleDisabled}
			globalHint={globalHint}
			control={
				<Toggle 
					checked={checked} 
					onChange={(v): void => {
						if (!isToggleDisabled) {
							onChange(v);
						}
					}} 
				/>
			}
		/>
	);
}
