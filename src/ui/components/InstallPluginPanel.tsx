import { useMemo, type JSX } from "react";
import { v4 as uuidv4 } from "uuid";

import { BasePanel } from "@/ui/components/BasePanel";
import { InstallPluginView } from "@/ui/views/InstallPluginView";

import type { InstallPluginModalOptions } from "@/domain/types";

interface InstallPluginPanelProps {
	readonly options: InstallPluginModalOptions;
	readonly onClose: () => void;
}

export function InstallPluginPanel({
	options,
	onClose,
}: InstallPluginPanelProps): JSX.Element {
	const sessionKey = useMemo((): string => {
		const repo = options.prefillRepo ?? "";
		const version = options.prefillVersion ?? "";
		const channel = options.prefillReleaseChannel ?? "";
		return `${repo}:${version}:${channel}:${uuidv4()}`;
	}, [options.prefillRepo, options.prefillVersion, options.prefillReleaseChannel]);

	return (
		<BasePanel centered isOpen onClose={onClose}>
			<InstallPluginView
				key={sessionKey}
				options={options}
				onClose={onClose}
			/>
		</BasePanel>
	);
}
