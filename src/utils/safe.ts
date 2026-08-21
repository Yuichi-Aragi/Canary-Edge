interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

type InferOk<R> = R extends Ok<infer T> ? T : never;

type InferErr<R> = R extends Err<infer E> ? E : never;

interface FlowOptions {
	readonly signal?: AbortSignal | undefined;
	readonly isDestroyed?: (() => boolean) | undefined;
}

const BAILOUT_MARKER = Symbol("BAILOUT_MARKER");

class BailoutError<E> extends Error {
	public readonly [BAILOUT_MARKER] = true;
	public readonly payload: E;

	public constructor(payload: E) {
		super("BAILOUT_ERROR");
		this.name = "BailoutError";
		this.payload = payload;
	}
}

function isBailoutError(err: unknown): err is BailoutError<unknown> {
	if (err === null || (typeof err !== "object" && typeof err !== "function")) {
		return false;
	}
	return BAILOUT_MARKER in err;
}

type DeferSync = (cb: () => void) => () => void;

type DeferAsync = (cb: () => void | Promise<void>) => () => void;

export interface Unwrapper<OuterE> {
	<U, F extends OuterE>(res: Result<U, F>): U;
	<U, F>(res: Result<U, F>, mapErr: (err: F) => OuterE): U;
	readonly checkpoint: () => void;
}

function apiStringify(val: unknown): string {
	if (val === null) {
		return "null";
	}
	if (val === undefined) {
		return "undefined";
	}
	if (typeof val === "string") {
		return val;
	}
	if (typeof val === "number" || typeof val === "boolean" || typeof val === "symbol") {
		return String(val);
	}
	if (typeof val === "bigint") {
		return `${val.toString()}n`;
	}
	if (typeof val === "function") {
		const fn = val as (...args: readonly unknown[]) => unknown;
		return `[Function: ${fn.name !== "" ? fn.name : "anonymous"}]`;
	}

	try {
		const seen = new WeakSet<object>();
		const jsonStr = JSON.stringify(val, (_key: string, value: unknown): unknown => {
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) {
					return `[Circular Reference: ${value.constructor.name}]`;
				}
				seen.add(value);
			}
			if (typeof value === "bigint") {
				return `${value.toString()}n`;
			}
			if (typeof value === "function") {
				const fn = value as (...args: readonly unknown[]) => unknown;
				return `[Function: ${fn.name !== "" ? fn.name : "anonymous"}]`;
			}
			return value;
		});
		if (jsonStr !== undefined) {
			return jsonStr;
		}
		return "[Unstringifiable Object]";
	} catch (err: unknown) {
		const errMsg = err instanceof Error ? err.message : String(err);
		return `[Unstringifiable Object: ${errMsg}]`;
	}
}

function isErrorLike(err: unknown): err is Error {
	return err instanceof Error || Object.prototype.toString.call(err) === "[object Error]";
}

export function normalizeError(err: unknown): Error {
	if (isErrorLike(err)) {
		return err;
	}
	if (typeof err === "string") {
		return new Error(err);
	}
	
	const fallbackMsg = `Operation failed with: ${apiStringify(err)}`;
	let msg = fallbackMsg;
	
	if (typeof err === "object" && err !== null && "message" in err && typeof (err as Record<string, unknown>)["message"] === "string") {
		msg = (err as Record<string, unknown>)["message"] as string;
	}
	
	const newErr = new Error(msg, { cause: err });
	
	if (typeof err === "object" && err !== null) {
		const target = newErr as unknown as Record<string, unknown>;
		const source = err as Record<string, unknown>;
		for (const key of Object.keys(source)) {
			if (key !== "name" && key !== "message" && key !== "stack") {
				target[key] = source[key];
			}
		}
	}
	
	return newErr;
}

function createAbortError(signal: AbortSignal): Error {
	if ("reason" in signal && signal.reason !== undefined && signal.reason !== null) {
		return normalizeError(signal.reason);
	}
	const err = new Error("Operation aborted");
	err.name = "AbortError";
	return err;
}

function checkFlowOptions(options?: Readonly<FlowOptions>): Error | undefined {
	if (options?.signal?.aborted === true) {
		return createAbortError(options.signal);
	}
	if (options?.isDestroyed !== undefined) {
		const destroyed = options.isDestroyed();
		if (destroyed === true) {
			const err = new Error("Operation context destroyed");
			err.name = "DestroyedError";
			return err;
		}
	}
	return undefined;
}

interface DeferEntry {
	readonly cb: () => void | Promise<void>;
}

class FlowContext<E> {
	private readonly defers: DeferEntry[] = [];
	private bailoutError: unknown;
	private hasBailedPrivate = false;

	public get hasBailed(): boolean {
		return this.hasBailedPrivate;
	}

	public readonly $: Unwrapper<E>;

	public constructor(private readonly options?: Readonly<FlowOptions>) {
		const unwrap = <U, F>(res: Result<U, F>, mapErr?: (err: F) => E): U => {
			this.checkpoint();
			if (res.ok === true) {
				return res.value;
			}
			const unwrappedErr = mapErr !== undefined ? mapErr(res.error) : res.error;
			this.hasBailedPrivate = true;
			this.bailoutError = unwrappedErr;
			throw new BailoutError(unwrappedErr);
		};

		this.$ = Object.assign(unwrap, {
			checkpoint: this.checkpoint.bind(this)
		}) as Unwrapper<E>;
	}

	public checkpoint(): void {
		const err = checkFlowOptions(this.options);
		if (err !== undefined) {
			this.hasBailedPrivate = true;
			this.bailoutError = err;
			throw new BailoutError(err);
		}
	}

	public registerDefer(cb: () => void | Promise<void>): () => void {
		const entry: DeferEntry = { cb };
		this.defers.push(entry);
		return (): void => {
			const idx = this.defers.indexOf(entry);
			if (idx !== -1) {
				this.defers.splice(idx, 1);
			}
		};
	}

	public getFinalError(threw: boolean, executionErr: unknown): unknown {
		if (threw) {
			if (isBailoutError(executionErr)) {
				return executionErr.payload;
			}
			return executionErr;
		}
		if (this.hasBailedPrivate) {
			return this.bailoutError;
		}
		return undefined;
	}

	public async runDefersAsync(initialError?: unknown): Promise<unknown> {
		const errors: unknown[] = initialError !== undefined ? [initialError] : [];
		const pending = [...this.defers].reverse();
		this.defers.length = 0;

		for (const entry of pending) {
			try {
				await entry.cb();
			} catch (e: unknown) {
				errors.push(e);
			}
		}

		if (errors.length === 0) {
			return undefined;
		}
		if (errors.length === 1) {
			return errors[0];
		}

		const flatErrors: unknown[] = [];
		for (const err of errors) {
			if (err instanceof AggregateError) {
				const subErrors = err.errors as readonly unknown[];
				flatErrors.push(...subErrors);
			} else {
				flatErrors.push(err);
			}
		}
		return new AggregateError(flatErrors, "Multiple errors occurred during execution and cleanup");
	}

	public runDefersSync(initialError?: unknown): unknown {
		const errors: unknown[] = initialError !== undefined ? [initialError] : [];
		const pending = [...this.defers].reverse();
		this.defers.length = 0;

		for (const entry of pending) {
			try {
				const result = entry.cb();
				if (result instanceof Promise) {
					errors.push(new TypeError("Async defer registered in synchronous safe context"));
				}
			} catch (e: unknown) {
				errors.push(e);
			}
		}

		if (errors.length === 0) {
			return undefined;
		}
		if (errors.length === 1) {
			return errors[0];
		}

		const flatErrors: unknown[] = [];
		for (const err of errors) {
			if (err instanceof AggregateError) {
				const subErrors = err.errors as readonly unknown[];
				flatErrors.push(...subErrors);
			} else {
				flatErrors.push(err);
			}
		}
		return new AggregateError(flatErrors, "Multiple errors occurred during execution and cleanup");
	}
}

export interface Api {
	<T, E = Error>(executor: ($: Unwrapper<E>, defer: DeferSync) => T): Result<T, E | Error>;

	readonly async: <T, E = Error>(
		executor: ($: Unwrapper<E>, defer: DeferAsync) => Promise<T>
	) => Promise<Result<T, E | Error>>;

	readonly with: (options: Readonly<FlowOptions>) => Api;

	readonly from: (param?: AbortSignal | Api | Readonly<FlowOptions>) => Api;

	readonly bind: (service: unknown) => Api;

	readonly options: Readonly<FlowOptions>;

	readonly ok: <T>(value: T) => Ok<T>;

	readonly err: <E>(error: E) => Err<E>;

	readonly wrap: <Args extends readonly unknown[], T, This = unknown>(
		fn: (this: This, ...args: Args) => T
	) => (this: This, ...args: Args) => Result<T>;

	readonly wrapAsync: <Args extends readonly unknown[], T, This = unknown>(
		fn: (this: This, ...args: Args) => Promise<T>
	) => (this: This, ...args: Args) => Promise<Result<T>>;

	readonly try: <T, E = Error>(fn: () => T) => Result<T, E | Error>;

	readonly tryAsync: <T, E = Error>(fn: () => Promise<T>) => Promise<Result<T, E | Error>>;

	readonly unwrap: <T, E>(res: Result<T, E>, message?: string) => T;

	readonly unwrapOr: <T, E>(res: Result<T, E>, fallback: T) => T;

	readonly unwrapOrElse: <T, E>(res: Result<T, E>, fallbackFn: (err: E) => T) => T;

	readonly assertOk: <T, E>(res: Result<T, E>, message?: string) => asserts res is Ok<T>;

	readonly assertErr: <T, E>(res: Result<T, E>, message?: string) => asserts res is Err<E>;

	readonly all: <T extends readonly Result<unknown, unknown>[]>(
		results: readonly [...T]
	) => Result<{ -readonly [P in keyof T]: InferOk<T[P]> }, InferErr<T[number]>>;

	readonly allAsync: <T extends readonly Promise<Result<unknown, unknown>>[]>(
		promises: readonly [...T]
	) => Promise<Result<{ -readonly [P in keyof T]: InferOk<Awaited<T[P]>> }, InferErr<Awaited<T[number]>>>>;

	readonly okIf: <E>(condition: boolean, error: E) => Result<boolean, E>;

	readonly some: <T, E>(val: T | null | undefined, error: E) => Result<T, E>;
}

function apiCallable<T, E = Error>(
	options: Readonly<FlowOptions> | undefined,
	executor: ($: Unwrapper<E>, defer: DeferSync) => T
): Result<T, E | Error> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			return { ok: false, error: earlyErr };
		}
	} catch (err: unknown) {
		return { ok: false, error: normalizeError(err) };
	}

	const ctx = new FlowContext<E>(options);

	let result: T | undefined;
	let executionErr: unknown;
	let threw = false;

	try {
		result = executor(ctx.$, ctx.registerDefer.bind(ctx));
	} catch (err: unknown) {
		threw = true;
		executionErr = err;
	}

	if (threw === false && ctx.hasBailed === false) {
		try {
			const lateErr = checkFlowOptions(options);
			if (lateErr !== undefined) {
				threw = true;
				executionErr = lateErr;
			}
		} catch (err: unknown) {
			threw = true;
			executionErr = err;
		}
	}

	const initialErr = ctx.getFinalError(threw, executionErr);
	const finalErr = ctx.runDefersSync(initialErr);

	if (finalErr !== undefined) {
		return { ok: false, error: finalErr as E | Error };
	}

	return { ok: true, value: result as T };
}

async function apiCallableAsync<T, E = Error>(
	options: Readonly<FlowOptions> | undefined,
	executor: ($: Unwrapper<E>, defer: DeferAsync) => Promise<T>
): Promise<Result<T, E | Error>> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			return { ok: false, error: earlyErr };
		}
	} catch (err: unknown) {
		return { ok: false, error: normalizeError(err) };
	}

	const ctx = new FlowContext<E>(options);

	let result: T | undefined;
	let executionErr: unknown;
	let threw = false;

	try {
		result = await executor(ctx.$, ctx.registerDefer.bind(ctx));
	} catch (err: unknown) {
		threw = true;
		executionErr = err;
	}

	if (threw === false && ctx.hasBailed === false) {
		try {
			const lateErr = checkFlowOptions(options);
			if (lateErr !== undefined) {
				threw = true;
				executionErr = lateErr;
			}
		} catch (err: unknown) {
			threw = true;
			executionErr = err;
		}
	}

	const initialErr = ctx.getFinalError(threw, executionErr);
	const finalErr = await ctx.runDefersAsync(initialErr);

	if (finalErr !== undefined) {
		return { ok: false, error: finalErr as E | Error };
	}

	return { ok: true, value: result as T };
}

function apiOk<T>(value: T): Ok<T> {
	return { ok: true, value };
}

function apiErr<E>(error: E): Err<E> {
	return { ok: false, error };
}

function apiWrap<Args extends readonly unknown[], T, This>(
	options: Readonly<FlowOptions> | undefined,
	fn: (this: This, ...args: Args) => T
): (this: This, ...args: Args) => Result<T> {
	return function (this: This, ...args: Args): Result<T> {
		try {
			const earlyErr = checkFlowOptions(options);
			if (earlyErr !== undefined) {
				return { ok: false, error: earlyErr };
			}
			return { ok: true, value: Reflect.apply(fn, this, args) as T };
		} catch (err: unknown) {
			return { ok: false, error: normalizeError(err) };
		}
	};
}

function apiWrapAsync<Args extends readonly unknown[], T, This>(
	options: Readonly<FlowOptions> | undefined,
	fn: (this: This, ...args: Args) => Promise<T>
): (this: This, ...args: Args) => Promise<Result<T>> {
	return async function (this: This, ...args: Args): Promise<Result<T>> {
		try {
			const earlyErr = checkFlowOptions(options);
			if (earlyErr !== undefined) {
				return { ok: false, error: earlyErr };
			}
			const value = await (Reflect.apply(fn, this, args) as Promise<T>);
			const lateErr = checkFlowOptions(options);
			if (lateErr !== undefined) {
				return { ok: false, error: lateErr };
			}
			return { ok: true, value };
		} catch (e: unknown) {
			return { ok: false, error: normalizeError(e) };
		}
	};
}

function apitry<T, E = Error>(
	options: Readonly<FlowOptions> | undefined,
	fn: () => T
): Result<T, E | Error> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			return { ok: false, error: earlyErr };
		}
		return { ok: true, value: fn() };
	} catch (err: unknown) {
		return { ok: false, error: normalizeError(err) };
	}
}

async function apitryAsync<T, E = Error>(
	options: Readonly<FlowOptions> | undefined,
	fn: () => Promise<T>
): Promise<Result<T, E | Error>> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			return { ok: false, error: earlyErr };
		}
		const value = await fn();
		const lateErr = checkFlowOptions(options);
		if (lateErr !== undefined) {
			return { ok: false, error: lateErr };
		}
		return { ok: true, value };
	} catch (e: unknown) {
		return { ok: false, error: normalizeError(e) };
	}
}

function apiUnwrap<T, E>(res: Result<T, E>, message?: string): T {
	if (res.ok === true) {
		return res.value;
	}
	if (isErrorLike(res.error)) {
		if (message !== undefined) {
			throw new Error(`${message}: ${res.error.message}`, { cause: res.error });
		}
		throw res.error;
	}
	const cause = new Error(apiStringify(res.error));
	const errMsg = message !== undefined ? `${message}: ${cause.message}` : cause.message;
	throw new Error(errMsg, { cause: res.error });
}

function apiUnwrapOr<T, E>(res: Result<T, E>, fallback: T): T {
	if (res.ok === true) {
		return res.value;
	}
	return fallback;
}

function apiUnwrapOrElse<T, E>(res: Result<T, E>, fallbackFn: (err: E) => T): T {
	if (res.ok === true) {
		return res.value;
	}
	return fallbackFn(res.error);
}

function apiAssertOk<T, E>(res: Result<T, E>, message?: string): asserts res is Ok<T> {
	if (res.ok === false) {
		if (isErrorLike(res.error)) {
			if (message !== undefined) {
				throw new Error(`${message}: ${res.error.message}`, { cause: res.error });
			}
			throw res.error;
		}
		const cause = new Error(apiStringify(res.error));
		const errMsg = message !== undefined ? `${message}: ${cause.message}` : cause.message;
		throw new Error(errMsg, { cause: res.error });
	}
}

function apiAssertErr<T, E>(res: Result<T, E>, message?: string): asserts res is Err<E> {
	if (res.ok === true) {
		const msg = message ?? "Assertion failed: Expected Err";
		const str = apiStringify(res.value);
		const truncated = str.length > 200 ? `${str.slice(0, 200)}...` : str;
		throw new Error(`${msg}. Got Ok value: ${truncated}`);
	}
}

function apiAll<T extends readonly Result<unknown, unknown>[]>(
	options: Readonly<FlowOptions> | undefined,
	results: readonly [...T]
): Result<{ -readonly [P in keyof T]: InferOk<T[P]> }, InferErr<T[number]>> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			return { ok: false, error: earlyErr } as unknown as Err<InferErr<T[number]>>;
		}
	} catch (err: unknown) {
		return { ok: false, error: normalizeError(err) } as unknown as Err<InferErr<T[number]>>;
	}

	if (!Array.isArray(results)) {
		return { ok: false, error: new Error("all requires an array of results") } as unknown as Err<InferErr<T[number]>>;
	}

	const values: unknown[] = [];
	for (const res of results) {
		const typedRes = res as Result<unknown, unknown>;
		if (typedRes === null || typeof typedRes !== "object" || !("ok" in typedRes)) {
			return { ok: false, error: new Error("Invalid Result object") } as unknown as Err<InferErr<T[number]>>;
		}
		if (typedRes.ok === false) {
			const errResult: Err<InferErr<T[number]>> = { ok: false, error: typedRes.error as InferErr<T[number]> };
			return errResult;
		}
		values.push(typedRes.value);
	}
	return { ok: true, value: values as { -readonly [P in keyof T]: InferOk<T[P]> } };
}

async function apiAllAsync<T extends readonly Promise<Result<unknown, unknown>>[]>(
	options: Readonly<FlowOptions> | undefined,
	promises: readonly [...T]
): Promise<Result<{ -readonly [P in keyof T]: InferOk<Awaited<T[P]>> }, InferErr<Awaited<T[number]>>>> {
	try {
		const earlyErr = checkFlowOptions(options);
		if (earlyErr !== undefined) {
			if (Array.isArray(promises)) {
				for (const p of promises) {
					Promise.resolve(p).catch((): void => {});
				}
			}
			return { ok: false, error: earlyErr } as unknown as Err<InferErr<Awaited<T[number]>>>;
		}
	} catch (err: unknown) {
		return { ok: false, error: normalizeError(err) } as unknown as Err<InferErr<Awaited<T[number]>>>;
	}

	if (!Array.isArray(promises)) {
		return { ok: false, error: new Error("allAsync requires an array of promises") } as unknown as Err<InferErr<Awaited<T[number]>>>;
	}

	return await new Promise((resolve): void => {
		if (promises.length === 0) {
			resolve({ ok: true, value: [] as unknown as { -readonly [P in keyof T]: InferOk<Awaited<T[P]>> } });
			return;
		}
		
		let results: unknown[] | null = new Array(promises.length);
		let pending = 0;
		let done = false;

		const cleanup = (listener: () => void): void => {
			if (options?.signal !== undefined) {
				options.signal.removeEventListener("abort", listener);
			}
		};

		const abortListener = (): void => {
			if (done) {
				return;
			}
			done = true;
			results = null;
			cleanup(abortListener);
			try {
				const err = checkFlowOptions(options) ?? new Error("Aborted");
				resolve({ ok: false, error: err } as unknown as Err<InferErr<Awaited<T[number]>>>);
			} catch (err: unknown) {
				resolve({ ok: false, error: normalizeError(err) } as unknown as Err<InferErr<Awaited<T[number]>>>);
			}
		};

		const signal = options?.signal;
		if (signal !== undefined && signal !== null) {
			if (signal.aborted === true) {
				abortListener();
			} else {
				signal.addEventListener("abort", abortListener, { once: true });
			}
		}

		const typedPromises = promises as readonly Promise<Result<unknown, unknown>>[];
		typedPromises.forEach((p, i): void => {
			pending += 1;
			
			Promise.resolve(p).then((res: Result<unknown, unknown>): void => {
				if (done) {
					return;
				}
				if (res === null || typeof res !== "object" || !("ok" in res)) {
					done = true;
					results = null;
					cleanup(abortListener);
					resolve({ ok: false, error: new Error("Invalid Result object") } as unknown as Err<InferErr<Awaited<T[number]>>>);
					return;
				}
				if (res.ok === false) {
					done = true;
					results = null;
					cleanup(abortListener);
					resolve(res as Err<InferErr<Awaited<T[number]>>>);
				} else {
					if (results !== null) {
						results[i] = res.value;
					}
					pending -= 1;
					if (pending === 0) {
						done = true;
						cleanup(abortListener);
						const finalValues = results;
						results = null;
						resolve({ ok: true, value: finalValues as unknown as { -readonly [P in keyof T]: InferOk<Awaited<T[P]>> } });
					}
				}
			}).catch((err: unknown): void => {
				if (done) {
					return;
				}
				done = true;
				results = null;
				cleanup(abortListener);
				resolve({ ok: false, error: normalizeError(err) } as unknown as Err<InferErr<Awaited<T[number]>>>);
			});
		});
	});
}

function apiOkIf<E>(condition: boolean, error: E): Result<boolean, E> {
	if (condition) {
		return { ok: true, value: true };
	}
	return { ok: false, error };
}

function apiSome<T, E>(val: T | null | undefined, error: E): Result<T, E> {
	if (val !== null && val !== undefined) {
		return { ok: true, value: val };
	}
	return { ok: false, error };
}

function createApi(baseOptions: Readonly<FlowOptions> = {}): Api {
	const callable = <T, E = Error>(executor: ($: Unwrapper<E>, defer: DeferSync) => T): Result<T, E | Error> => {
		return apiCallable(baseOptions, executor);
	};

	const callableObj = {
		async: <T, E = Error>(executor: ($: Unwrapper<E>, defer: DeferAsync) => Promise<T>): Promise<Result<T, E | Error>> => {
			return apiCallableAsync(baseOptions, executor);
		},
		with: (options: Readonly<FlowOptions>): Api => {
			const parentSignal = baseOptions.signal;
			const childSignal = options.signal;
			const mergedSignal = childSignal ?? parentSignal;

			const parentDestroyed = baseOptions.isDestroyed;
			const childDestroyed = options.isDestroyed;
			let mergedIsDestroyed: (() => boolean) | undefined;

			if (parentDestroyed !== undefined && childDestroyed !== undefined) {
				mergedIsDestroyed = (): boolean => {
					return parentDestroyed() || childDestroyed();
				};
			} else {
				mergedIsDestroyed = parentDestroyed ?? childDestroyed;
			}

			return createApi({ signal: mergedSignal, isDestroyed: mergedIsDestroyed });
		},
		from: (param?: AbortSignal | Api | Readonly<FlowOptions>): Api => {
			if (param === undefined) {
				return createApi(baseOptions);
			}
			if (typeof param === "function" && "options" in param) {
				return (param as Api).with(baseOptions);
			}
			if (param instanceof AbortSignal) {
				return createApi(baseOptions).with({ signal: param });
			}
			if (typeof param === "object" && param !== null) {
				return createApi(baseOptions).with(param);
			}
			return createApi(baseOptions);
		},
		bind: (service: unknown): Api => {
			const check = typeof service === "function"
				? (service as () => boolean)
				: (): boolean => {
					if (service !== null && typeof service === "object") {
						if ("isDestroyed" in service && typeof service.isDestroyed === "function") {
							return (service.isDestroyed as () => boolean)();
						}
						if ("disposed" in service && service.disposed === true) {
							return true;
						}
					}
					return false;
				};
			return callableObj.with({ isDestroyed: check });
		},
		options: baseOptions,
		ok: apiOk,
		err: apiErr,
		wrap: <Args extends readonly unknown[], T, This = unknown>(fn: (this: This, ...args: Args) => T) => {
			return apiWrap(baseOptions, fn);
		},
		wrapAsync: <Args extends readonly unknown[], T, This = unknown>(fn: (this: This, ...args: Args) => Promise<T>) => {
			return apiWrapAsync(baseOptions, fn);
		},
		try: <T, E = Error>(fn: () => T): Result<T, E | Error> => {
			return apitry(baseOptions, fn);
		},
		tryAsync: <T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E | Error>> => {
			return apitryAsync(baseOptions, fn);
		},
		unwrap: apiUnwrap,
		unwrapOr: apiUnwrapOr,
		unwrapOrElse: apiUnwrapOrElse,
		assertOk: apiAssertOk,
		assertErr: apiAssertErr,
		all: <T extends readonly Result<unknown, unknown>[]>(results: readonly [...T]) => {
			return apiAll(baseOptions, results);
		},
		allAsync: <T extends readonly Promise<Result<unknown, unknown>>[]>(promises: readonly [...T]) => {
			return apiAllAsync(baseOptions, promises);
		},
		okIf: apiOkIf,
		some: apiSome,
	};

	return Object.assign(callable, callableObj) as Api;
}

export const safe: Api = createApi();
