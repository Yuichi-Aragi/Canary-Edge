import { createContext, use, type ReactNode, type JSX } from "react";

export interface PortalContextValue {
	readonly portalRef: HTMLElement | null;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({
	children,
	value,
}: {
	readonly children: ReactNode;
	readonly value: PortalContextValue;
}): JSX.Element {
	return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortalContext(): PortalContextValue {
	const context = use(PortalContext);
	if (context === null) {
		return { portalRef: null };
	}
	return context;
}
