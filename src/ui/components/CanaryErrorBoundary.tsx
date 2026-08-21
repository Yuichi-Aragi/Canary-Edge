import { useCallback, type ErrorInfo, type PropsWithChildren, type JSX } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { match } from "ts-pattern";

import { Button } from "@/ui/components/BaseComponents";
import { Icon } from "@/ui/components/Icon";
import { safe } from "@/utils/safe";

type ErrorBoundaryVariant = "default" | "card";

interface CanaryErrorBoundaryProps extends PropsWithChildren {
	readonly variant?: ErrorBoundaryVariant;
}

function DefaultErrorFallback({ error, resetErrorBoundary }: FallbackProps): JSX.Element {
	const errorMessage = error instanceof Error ? error.message : String(error);

	return (
		<div className="ce-error-boundary">
			<Icon className="ce-error-icon" name="alert-triangle" />
			<h3>Something went wrong</h3>
			<pre className="ce-error-message">{errorMessage}</pre>
			<Button 
				text="Try again" 
				variant="cta"
				onClick={resetErrorBoundary} 
			/>
		</div>
	);
}

function CardErrorFallback({ error, resetErrorBoundary }: FallbackProps): JSX.Element {
	const errorMessage = error instanceof Error ? error.message : String(error);

	return (
		<div className="ce-card-error">
			<div className="ce-card-error-content">
				<Icon className="ce-error-icon-sm" name="alert-triangle" />
				<div className="ce-card-error-text">
					<span className="error-title">Component Error</span>
					<span className="error-details" title={errorMessage}>{errorMessage}</span>
				</div>
			</div>
			<Button 
				className="ce-card-retry-btn"
				size="sm"
				text="Retry" 
				onClick={resetErrorBoundary} 
			/>
		</div>
	);
}

export function CanaryErrorBoundary(props: CanaryErrorBoundaryProps): JSX.Element {
	const { children, variant } = props;
	const activeVariant = variant ?? "default";

	const logError = useCallback((error: unknown, info: ErrorInfo): void => {
		const componentStack = info.componentStack ?? "No stack available";
		const res = safe.try((): void => {
			console.error("UI Error Caught by Boundary:", error);
			console.info(`Component Stack: ${componentStack}`);
		});
		if (!res.ok) {
			console.error("Failed to log error:", res.error);
			console.error("Original error:", error);
		}
	}, []);

	const FallbackComponent = match(activeVariant)
		.with("card", () => CardErrorFallback)
		.otherwise(() => DefaultErrorFallback);

	return (
		<ErrorBoundary
			FallbackComponent={FallbackComponent}
			onError={logError}
			onReset={(): void => {
			}}
		>
			{children}
		</ErrorBoundary>
	);
}
