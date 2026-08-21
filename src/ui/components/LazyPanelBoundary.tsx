import { Suspense, type JSX, type ReactNode } from "react";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { StateContainer } from "@/ui/components/StateContainer";

export interface LazyPanelBoundaryProps {
	readonly loadingMessage: string;
	readonly loadingTitle?: string | undefined;
	readonly children: ReactNode;
}

export function LazyPanelBoundary({
	loadingMessage,
	loadingTitle,
	children,
}: LazyPanelBoundaryProps): JSX.Element {
	return (
		<CanaryErrorBoundary>
			<Suspense fallback={<StateContainer message={loadingMessage} title={loadingTitle} type="loading" />}>
				{children}
			</Suspense>
		</CanaryErrorBoundary>
	);
}
