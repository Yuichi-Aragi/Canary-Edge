export const headerToString = (value: unknown): string => {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value
			.map((item: unknown): string => {
				return headerToString(item);
			})
			.filter((item: string): boolean => {
				return item.length > 0;
			})
			.join(", ");
	}
	if (value instanceof Error) {
		return value.message;
	}
	return "";
};

export const parseHeaderList = (headers: Readonly<Record<string, unknown>>, key: string): string[] => {
	const val = headers[key] ?? headers[key.toLowerCase()];
	const str = headerToString(val);
	return str.length > 0 ? str.split(", ").filter(Boolean) : [];
};

export const normalizeHeaders = (
	input: RequestInit["headers"] | Readonly<Record<string, unknown>> | undefined,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (input === undefined || input === null) {
		return headers;
	}

	if (typeof Headers !== "undefined" && (input instanceof Headers || (typeof input === "object" && Symbol.iterator in input))) {
		new Headers(input as HeadersInit).forEach((value: string, key: string): void => {
			headers[key.toLowerCase()] = value;
		});
		return headers;
	}

	if (typeof input === "object") {
		for (const [key, value] of Object.entries(input)) {
			if (value !== undefined && value !== null) {
				headers[key.toLowerCase()] = Array.isArray(value)
					? value.join(", ")
					: String(value);
			}
		}
	}

	return headers;
};

export const toDataBuffer = (data: unknown): ArrayBuffer | null => {
	if (data === null || data === undefined) {
		return null;
	}
	if (data instanceof ArrayBuffer) {
		return data;
	}
	if (ArrayBuffer.isView(data) === true) {
		const view = data;
		const viewBuffer = new ArrayBuffer(view.byteLength);
		new Uint8Array(viewBuffer).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
		return viewBuffer;
	}

	let serialized: string;
	if (typeof data === "string") {
		serialized = data;
	} else if (typeof data === "number" || typeof data === "boolean") {
		serialized = String(data);
	} else {
		serialized = JSON.stringify(data);
	}

	const encoder = new TextEncoder();
	const encodedBytes = encoder.encode(serialized);
	const resultBuffer = new ArrayBuffer(encodedBytes.byteLength);
	new Uint8Array(resultBuffer).set(encodedBytes);
	return resultBuffer;
};

export const extractRawString = (payload: unknown): string => {
	if (typeof payload === "string") {
		return payload;
	}

	if (
		typeof payload === "object" &&
		payload !== null &&
		"data" in payload &&
		typeof (payload as { readonly data: unknown }).data === "string"
	) {
		return (payload as { readonly data: string }).data;
	}

	throw new Error("Failed to read raw content payload: invalid response format.");
};
