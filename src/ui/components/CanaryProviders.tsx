import { useMemo, type PropsWithChildren, type JSX } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StoreProvider } from "easy-peasy";

import { queryClient } from "@/core/queryClient";
import { usePlugin } from "@/ui/context/PluginContext";
import { PanelStackProvider } from "@/ui/context/PanelStackContext";

import type { CanaryStore } from "@/store/CanaryStore";

export function CanaryProviders({ children }: PropsWithChildren): JSX.Element {
	const plugin = usePlugin();

	const storeInstance = useMemo((): CanaryStore => {
		return plugin.container.resolve("canaryStore");
	}, [plugin]);

	return (
		<StoreProvider store={storeInstance.store}>
			<QueryClientProvider client={queryClient}>
				<PanelStackProvider>
					{children}
				</PanelStackProvider>
			</QueryClientProvider>
		</StoreProvider>
	);
}
