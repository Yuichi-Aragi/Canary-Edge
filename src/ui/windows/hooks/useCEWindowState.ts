import { useMemo, useCallback } from "react";
import { useLocalStorageState } from "ahooks";
import { clamp } from "es-toolkit";
import * as v from "valibot";

import { WindowStateSchema, WINDOW_CONSTANTS } from "../types";

import type { WindowState } from "../types";

type SetWindowState = (value?: WindowState | ((prev?: WindowState) => WindowState)) => void;

export interface UseCEWindowStateReturn {
	readonly displayRect: WindowState;
	readonly setWindowState: SetWindowState;
	readonly resetToDefault: () => void;
}

const getSafeBounds = (): { readonly safeW: number; readonly safeH: number } => {
	const { innerWidth: winWidth, innerHeight: winHeight } = window;
	const w = winWidth > 0 ? winWidth : 1024;
	const h = winHeight > 0 ? winHeight : 768;
	return {
		safeW: Math.max(0, w - (WINDOW_CONSTANTS.SIDE_PADDING * 2)),
		safeH: Math.max(0, h - WINDOW_CONSTANTS.TOP_SAFE_ZONE - WINDOW_CONSTANTS.BOTTOM_PADDING)
	};
};

const getDefaultState = (): WindowState => {
	const { innerWidth: winWidth } = window;
	const w = winWidth > 0 ? winWidth : 1024;
	const { safeW, safeH } = getSafeBounds();
	const isMobile = w < 600;
	
	const width = isMobile ? safeW : Math.min(900, safeW * 0.9);
	const height = isMobile ? safeH : Math.min(700, safeH * 0.9);

	return {
		width,
		height,
		x: (safeW - width) / 2,
		y: (safeH - height) / 2
	};
};

function deserializeWindowState(value: string, fallback: WindowState): WindowState {
	try {
		const parsed: unknown = JSON.parse(value);
		const result = v.safeParse(WindowStateSchema, parsed);
		if (result.success) {
			return result.output;
		}
		return fallback;
	} catch {
		return fallback;
	}
}

export function useCEWindowState(): UseCEWindowStateReturn {
	const [persistedState, setPersistedState] = useLocalStorageState<WindowState>(
		WINDOW_CONSTANTS.STORAGE_KEY, 
		{
			defaultValue: getDefaultState(),
			serializer: JSON.stringify,
			deserializer: (value: string): WindowState => {
				return deserializeWindowState(value, getDefaultState());
			}
		}
	) as [WindowState, SetWindowState];

	const displayRect = useMemo((): WindowState => {
		const { x: rawX, y: rawY, width: rawW, height: rawH } = persistedState;
		const { safeW, safeH } = getSafeBounds();
		
		const width = clamp(
			rawW, 
			Math.min(WINDOW_CONSTANTS.MIN_WIDTH, safeW), 
			safeW
		);
		const height = clamp(
			rawH, 
			Math.min(WINDOW_CONSTANTS.MIN_HEIGHT, safeH), 
			safeH
		);

		return {
			width,
			height,
			x: clamp(rawX, 0, Math.max(0, safeW - width)),
			y: clamp(rawY, 0, Math.max(0, safeH - height))
		};
	}, [persistedState]);

	const resetToDefault = useCallback((): void => {
		setPersistedState(getDefaultState());
	}, [setPersistedState]);

	return {
		displayRect,
		setWindowState: setPersistedState,
		resetToDefault
	};
}
