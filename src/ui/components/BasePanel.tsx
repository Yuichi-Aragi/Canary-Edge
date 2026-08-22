import {
	useCallback,
	useRef,
	useEffect,
	useId,
	type JSX,
	type ReactNode,
	type MouseEvent as ReactMouseEvent,
} from "react";
import {
	useFloating,
	useInteractions,
	useDismiss,
	useRole,
	FloatingPortal,
	FloatingOverlay,
} from "@floating-ui/react";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";

import { usePortalContext } from "@/ui/context/PortalContext";
import { usePanelStack } from "@/ui/context/PanelStackContext";

export interface BasePanelProps {
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly children: ReactNode;
	readonly className?: string | undefined;
	readonly centered?: boolean | undefined;
}

const backdropVariants = cva("ce-discover-panel-backdrop", {
	variants: {
		centered: {
			true: "mod-centered",
			false: "",
		},
	},
	defaultVariants: {
		centered: false,
	},
});

export function BasePanel(props: BasePanelProps): JSX.Element | null {
	const { isOpen, onClose, children, className, centered } = props;
	const isCentered = centered ?? false;
	const panelId = useId();

	const { portalRef } = usePortalContext();
	const { registerPanel, unregisterPanel, isTopPanel, getPanelDepth } = usePanelStack();

	const isClosingRef = useRef<boolean>(false);

	const onCloseRef = useRef<() => void>(onClose);
	useEffect((): void => {
		onCloseRef.current = onClose;
	});

	useEffect((): (() => void) => {
		if (isOpen) {
			isClosingRef.current = false;
			registerPanel(panelId);
		} else {
			unregisterPanel(panelId);
		}

		return (): void => {
			unregisterPanel(panelId);
		};
	}, [isOpen, panelId, registerPanel, unregisterPanel]);

	const isTop = isTopPanel(panelId);
	const depth = getPanelDepth(panelId);

	const safeClose = useCallback((): void => {
		if (isClosingRef.current) {
			return;
		}
		isClosingRef.current = true;
		onCloseRef.current();
	}, []);

	const isTopRef = useRef<boolean>(isTop);
	useEffect((): void => {
		isTopRef.current = isTop;
	}, [isTop]);

	const { refs, context } = useFloating({
		open: isOpen,
		onOpenChange: (isCurrentlyOpen: boolean): void => {
			if (!isCurrentlyOpen && isTopRef.current) {
				safeClose();
			}
		},
	});

	const dismiss = useDismiss(context, {
		outsidePress: false,
		escapeKey: isTop,
		bubbles: false,
	});

	const role = useRole(context);
	const { getFloatingProps } = useInteractions([dismiss, role]);

	const handleLightDismiss = useCallback(
		(e: ReactMouseEvent<HTMLDivElement>): void => {
			if (e.target === e.currentTarget && isTopRef.current) {
				e.preventDefault();
				e.stopPropagation();
				safeClose();
			}
		},
		[safeClose]
	);

	if (!isOpen) {
		return null;
	}

	const baseZIndex = 1000;
	const overlayStyle = depth > 0 ? { zIndex: baseZIndex + depth * 10 } : undefined;

	return (
		<FloatingPortal root={portalRef}>
			<FloatingOverlay
				className={clsx(backdropVariants({ centered: isCentered }))}
				lockScroll={false}
				style={overlayStyle}
				onClick={handleLightDismiss}
			>
				<div
					ref={(node: HTMLDivElement | null): void => {
						refs.setFloating(node);
					}}
					className={clsx("ce-discover-panel-scroll-wrapper", className)}
					{...getFloatingProps()}
					onClick={handleLightDismiss}
				>
					{children}
				</div>
			</FloatingOverlay>
		</FloatingPortal>
	);
}
