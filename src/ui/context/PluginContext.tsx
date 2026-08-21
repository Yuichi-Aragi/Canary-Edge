import { createContext, use, type ReactNode, type JSX } from "react";
import type CanaryEdgePlugin from "@/main";

const PluginContext = createContext<CanaryEdgePlugin | null>(null);

export function PluginProvider({ 
	plugin, 
	children 
}: { 
	readonly plugin: CanaryEdgePlugin; 
	readonly children: ReactNode; 
}): JSX.Element {
	return <PluginContext.Provider value={plugin}>{children}</PluginContext.Provider>;
}

export function usePlugin(): CanaryEdgePlugin {
	const context = use(PluginContext);
	if (context === null) {
		throw new Error("usePlugin must be used within a PluginProvider");
	}
	return context;
}
