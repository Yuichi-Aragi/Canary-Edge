import {
	createContext,
	use,
	useState,
	useCallback,
	useMemo,
	type ReactNode,
	type JSX,
} from "react";

import { useWorkspaceMenuLock } from "@/ui/hooks/useWorkspaceMenuLock";

export interface PanelStackContextValue {
	readonly registerPanel: (id: string) => void;
	readonly unregisterPanel: (id: string) => void;
	readonly isTopPanel: (id: string) => boolean;
	readonly getPanelDepth: (id: string) => number;
	readonly stackSize: number;
}

const PanelStackContext = createContext<PanelStackContextValue | null>(null);

export interface PanelStackProviderProps {
	readonly children: ReactNode;
}

export function PanelStackProvider({ children }: PanelStackProviderProps): JSX.Element {
	const [stack, setStack] = useState<readonly string[]>([]);

	useWorkspaceMenuLock(stack.length > 0);

	const registerPanel = useCallback((id: string): void => {
		setStack((prevStack: readonly string[]): readonly string[] => {
			if (prevStack.includes(id)) {
				return prevStack;
			}
			return [...prevStack, id];
		});
	}, []);

	const unregisterPanel = useCallback((id: string): void => {
		setStack((prevStack: readonly string[]): readonly string[] => {
			if (prevStack.includes(id) === false) {
				return prevStack;
			}
			return prevStack.filter((panelId: string): boolean => {
				return panelId !== id;
			});
		});
	}, []);

	const isTopPanel = useCallback(
		(id: string): boolean => {
			if (stack.length === 0) {
				return false;
			}
			return stack[stack.length - 1] === id;
		},
		[stack]
	);

	const getPanelDepth = useCallback(
		(id: string): number => {
			const index = stack.indexOf(id);
			if (index === -1) {
				return 0;
			}
			return index;
		},
		[stack]
	);

	const value = useMemo((): PanelStackContextValue => {
		return {
			registerPanel,
			unregisterPanel,
			isTopPanel,
			getPanelDepth,
			stackSize: stack.length,
		};
	}, [registerPanel, unregisterPanel, isTopPanel, getPanelDepth, stack.length]);

	return <PanelStackContext.Provider value={value}>{children}</PanelStackContext.Provider>;
}

const DEFAULT_PANEL_STACK_VALUE: PanelStackContextValue = {
	registerPanel: (_id: string): void => {},
	unregisterPanel: (_id: string): void => {},
	isTopPanel: (_id: string): boolean => true,
	getPanelDepth: (_id: string): number => 0,
	stackSize: 1,
};

export function usePanelStack(): PanelStackContextValue {
	const context = use(PanelStackContext);
	if (context === null) {
		return DEFAULT_PANEL_STACK_VALUE;
	}
	return context;
}
