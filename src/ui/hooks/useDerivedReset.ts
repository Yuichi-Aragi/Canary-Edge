import { useState } from "react";

export function useDerivedReset(
	dependency: unknown,
	onReset: () => void
): void {
	const [prevDependency, setPrevDependency] = useState<unknown>(dependency);

	if (dependency !== prevDependency) {
		setPrevDependency(dependency);
		onReset();
	}
}
