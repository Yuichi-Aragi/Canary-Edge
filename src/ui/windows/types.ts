import * as v from "valibot";

export const WindowStateSchema = v.object({
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number()
});

export type WindowState = v.InferOutput<typeof WindowStateSchema>;

export const WINDOW_CONSTANTS = {
	TOP_SAFE_ZONE: 50,
	SIDE_PADDING: 16,
	BOTTOM_PADDING: 24,
	MIN_WIDTH: 400,
	MIN_HEIGHT: 500,
	Z_INDEX: 9999,
	STORAGE_KEY: "ce-window-state",
} as const;
