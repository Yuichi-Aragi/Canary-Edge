import { useCallback, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import invariant from "tiny-invariant";

import type { RefObject } from "react";

export interface UseWindowAnimationsArgs {
	readonly containerRef: RefObject<HTMLDivElement | null>;
	readonly animatorRef: RefObject<HTMLDivElement | null>;
}

export function useWindowAnimations({
	containerRef,
	animatorRef,
}: UseWindowAnimationsArgs): (onComplete: () => void) => void {
	const animateExitRef = useRef<((onComplete: () => void) => void) | null>(null);
	const hasAnimatedInRef = useRef<boolean>(false);

	useGSAP((_context, contextSafe) => {
		const target = animatorRef.current;
		invariant(target !== null, "Animation target ref missing");

		if (!hasAnimatedInRef.current) {
			gsap.from(target, {
				opacity: 0,
				scale: 0.97,
				y: 15,
				duration: 0.3,
				ease: "power2.out",
				force3D: true,
				clearProps: "opacity,scale,y,willChange",
				onComplete: (): void => {
					hasAnimatedInRef.current = true;
				},
			});
		}

		if (contextSafe !== undefined) {
			animateExitRef.current = contextSafe((onComplete: () => void): void => {
				gsap.to(target, {
					opacity: 0,
					scale: 0.97,
					y: 10,
					duration: 0.2,
					ease: "power2.in",
					force3D: true,
					onComplete,
				});
			});
		}

		return (): void => {
			animateExitRef.current = null;
		};
	}, { scope: containerRef, dependencies: [] });

	const animateExit = useCallback((onComplete: () => void): void => {
		if (animateExitRef.current !== null) {
			animateExitRef.current(onComplete);
		} else {
			onComplete();
		}
	}, []);

	return animateExit;
}
