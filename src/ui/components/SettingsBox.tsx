import type { JSX, ReactNode } from "react";
import { clsx } from "clsx";
import { Icon } from "@/ui/components/Icon";

export type IconVariant = "blue" | "green" | "orange" | "purple" | "red" | "yellow" | "cyan";

export interface SettingsBoxProps {
	readonly title: string;
	readonly description: ReactNode;
	readonly control: ReactNode;
	readonly globalHint?: ReactNode | undefined;
	readonly icon: string;
	readonly iconVariant: IconVariant;
	readonly isDisabled?: boolean;
}

export function SettingsBox({ 
	title, 
	description, 
	control, 
	globalHint,
	icon,
	iconVariant,
	isDisabled 
}: SettingsBoxProps): JSX.Element {
	return (
		<div className={clsx(
			"ce-settings-box", 
			isDisabled === true && "mod-disabled"
		)}>
			<div className="ce-settings-box-header">
				<div className={clsx("ce-settings-icon-wrapper", `mod-${iconVariant}`)}>
					<Icon name={icon} />
				</div>
				<div className="ce-settings-box-title">{title}</div>
			</div>

			<div className="ce-settings-box-description">
				{description}
			</div>

			<div className="ce-settings-box-footer">
				<div className="ce-settings-global-hint">
					{globalHint}
				</div>
				<div className="ce-settings-control-wrapper">
					{control}
				</div>
			</div>
		</div>
	);
}
