import { createContext, use } from "react";

import type { ReactNode, JSX } from "react";

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
	return <PortalContext value={value}>{children}</PortalContext>;
}

export function usePortalContext(): PortalContextValue {
	const context = use(PortalContext);
	if (context === null) {
		return { portalRef: null };
	}
	return context;
}
