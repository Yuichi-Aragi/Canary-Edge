import { lazy, type LazyExoticComponent, type ComponentType } from "react";

export type PreloadableComponent<TProps> = LazyExoticComponent<ComponentType<TProps>> & {
	readonly preload: () => Promise<{ readonly default: ComponentType<TProps> }>;
};

export function lazyWithPreload<TProps>(
	factory: () => Promise<{ readonly default: ComponentType<TProps> }>
): PreloadableComponent<TProps> {
	let loadedPromise: Promise<{ readonly default: ComponentType<TProps> }> | null = null;

	const preload = (): Promise<{ readonly default: ComponentType<TProps> }> => {
		loadedPromise ??= factory();
		return loadedPromise;
	};

	const LazyComponent = lazy(preload);

	return Object.assign(LazyComponent, {
		preload,
	});
}
