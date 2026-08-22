import { createContext, use } from "react";

import type CanaryEdgePlugin from "@/main";
import type { ReactNode, JSX } from "react";

const PluginContext = createContext<CanaryEdgePlugin | null>(null);

export function PluginProvider({ 
	plugin, 
	children,
}: { 
	readonly plugin: CanaryEdgePlugin; 
	readonly children: ReactNode; 
}): JSX.Element {
	return <PluginContext value={plugin}>{children}</PluginContext>;
}

export function usePlugin(): CanaryEdgePlugin {
	const context = use(PluginContext);
	if (context === null) {
		throw new Error("usePlugin must be used within a PluginProvider");
	}
	return context;
}
