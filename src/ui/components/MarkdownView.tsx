import { useEffect, useRef, type JSX } from "react";
import { Component, MarkdownRenderer } from "obsidian";

import { usePlugin } from "@/ui/context/PluginContext";

export interface MarkdownViewProps {
	readonly markdown: string;
	readonly className?: string | undefined;
}

export function MarkdownView({ markdown, className }: MarkdownViewProps): JSX.Element {
	const plugin = usePlugin();
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect((): (() => void) => {
		const container = containerRef.current;
		if (container === null) {
			return (): void => {};
		}

		container.replaceChildren();

		const comp = new Component();
		comp.load();

		void MarkdownRenderer.render(
			plugin.app,
			markdown,
			container,
			"",
			comp
		);

		return (): void => {
			comp.unload();
		};
	}, [markdown, plugin.app]);

	const rootClassName = className !== undefined 
		? `ce-readme-markdown-content markdown-rendered markdown-preview-view ${className}`
		: "ce-readme-markdown-content markdown-rendered markdown-preview-view";

	return <div ref={containerRef} className={rootClassName} />;
}
