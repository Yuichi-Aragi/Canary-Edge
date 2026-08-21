import { isString, trim } from "es-toolkit";
import invariant from "tiny-invariant";
import { match, P } from "ts-pattern";
import { safe, type Result } from "@/utils/safe";
import {
    array,
    check,
    integer,
    maxLength,
    maxValue,
    minLength,
    minValue,
    number,
    object,
    optional,
    pipe,
    regex,
    safeParse,
    string,
    transform,
    union
} from "valibot";

const VersionComponentSchema = pipe(
    number(),
    integer(),
    minValue(0),
    maxValue(Number.MAX_SAFE_INTEGER)
);

const PrereleaseIdentifierSchema = union([
    pipe(
        number(), 
        integer(), 
        minValue(0),
        maxValue(Number.MAX_SAFE_INTEGER)
    ),
    pipe(
        string(),
        regex(/^[0-9A-Za-z-]+$/),
        maxLength(256)
    )
]);

const BuildIdentifierSchema = pipe(
    string(),
    regex(/^[0-9A-Za-z-]+$/),
    maxLength(256)
);

const SemVerSchema = object({
    major: VersionComponentSchema,
    minor: VersionComponentSchema,
    patch: VersionComponentSchema,
    version: pipe(string(), maxLength(2048)),
    prerelease: array(PrereleaseIdentifierSchema),
    buildMetadata: optional(array(BuildIdentifierSchema))
});

export interface SemVerLike {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    readonly version: string;
    readonly prerelease: readonly (string | number)[];
    readonly buildMetadata?: readonly string[];
}

export interface CoerceOptions {
    readonly includePrerelease?: boolean;
    readonly loose?: boolean;
}

type ParseError = 
    | { readonly type: "INVALID_INPUT"; readonly message: string; readonly cause?: unknown }
    | { readonly type: "FORMAT_ERROR"; readonly message: string }
    | { readonly type: "VALIDATION_ERROR"; readonly message: string; readonly cause?: unknown };

type IdentifierType = 
    | { readonly kind: "numeric"; readonly value: number }
    | { readonly kind: "alphanumeric"; readonly value: string }
    | { readonly kind: "undefined" };

const MAX_INPUT_LENGTH = 2048;

const sanitizeInput = (raw: unknown): Result<string, ParseError> => {
    if (!isString(raw)) {
        return safe.err({ type: "INVALID_INPUT", message: "Input must be a string" });
    }

    const schema = pipe(
        string(),
        minLength(1),
        maxLength(MAX_INPUT_LENGTH),
        transform((s: string): string => {
            return trim(s);
        }),
        check((s: string): boolean => {
            return s.length > 0;
        }, "String cannot be empty after trimming")
    );

    const result = safeParse(schema, raw);
    
    if (!result.success) {
        return safe.err({ 
            type: "INVALID_INPUT", 
            message: "Input failed sanitization",
            cause: result.issues
        });
    }

    return safe.ok(result.output);
};

const parsePrerelease = (
    raw: string, 
    loose: boolean
): Result<readonly (string | number)[], ParseError> => {
    if (raw.length === 0) { 
        return safe.ok([]); 
    }

    const delimiter = loose ? /[.\-_]+/ : /\./;
    const parts = raw.split(delimiter).filter(Boolean);

    if (parts.length > 256) {
        return safe.err({ type: "VALIDATION_ERROR", message: "Too many prerelease identifiers" });
    }

    const identifiers: (string | number)[] = [];

    for (const part of parts) {
        const numericRegex = /^(0|[1-9]\d*)$/;
        const isNumeric = numericRegex.test(part);

        if (isNumeric) {
            const num = parseInt(part, 10);
            
            if (num > Number.MAX_SAFE_INTEGER) {
                return safe.err({ 
                    type: "VALIDATION_ERROR", 
                    message: `Numeric identifier overflow: ${part}` 
                });
            }
            
            identifiers.push(num);
        } else {
            const result = safeParse(
                pipe(string(), regex(/^[0-9A-Za-z-]+$/)),
                part
            );
            
            if (!result.success) {
                return safe.err({ 
                    type: "VALIDATION_ERROR", 
                    message: `Invalid prerelease identifier: ${part}` 
                });
            }
            
            identifiers.push(part);
        }
    }

    return safe.ok(Object.freeze(identifiers));
};

const parseBuildMetadata = (raw: string): Result<readonly string[], ParseError> => {
    if (raw.length === 0) { 
        return safe.ok([]); 
    }

    const parts = raw.split(".");
    const validated: string[] = [];

    for (const part of parts) {
        const result = safeParse(
            pipe(
                string(),
                minLength(1),
                regex(/^[0-9A-Za-z-]+$/)
            ),
            part
        );
        if (!result.success) {
            return safe.err({ type: "VALIDATION_ERROR", message: `Invalid build metadata identifier: ${part}` });
        }

        validated.push(part);
    }

    return safe.ok(Object.freeze(validated));
};

const parseVersionInternal = (
    input: string, 
    loose: boolean
): Result<SemVerLike, ParseError> => {
    const withoutPrefix = input.replace(/^v/i, "");
    
    const strictRegex = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?(?:\+(.+))?$/;
    const looseRegex = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?([^\d].*)?$/;
    
    const regexPattern = loose ? looseRegex : strictRegex;
    const matchResult = withoutPrefix.match(regexPattern);

    if (matchResult === null) {
        return safe.err({ 
            type: "FORMAT_ERROR", 
            message: `Version string does not match expected format: ${input}` 
        });
    }

    const majorStr = matchResult[1] ?? "0";
    const minorStr = matchResult[2] ?? "0";
    const patchStr = matchResult[3] ?? "0";
    const remainder = matchResult[4] ?? "";

    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    const patch = parseInt(patchStr, 10);

    const majorCheck = safeParse(VersionComponentSchema, major);
    const minorCheck = safeParse(VersionComponentSchema, minor);
    const patchCheck = safeParse(VersionComponentSchema, patch);

    if (!majorCheck.success || !minorCheck.success || !patchCheck.success) {
        return safe.err({ 
            type: "VALIDATION_ERROR", 
            message: "Version components must be non-negative integers within safe range" 
        });
    }

    const [prereleaseStr, buildStr] = loose 
        ? (() => {
            const parts = remainder.split("+");
            const firstPart = parts[0] ?? "";
            const secondPart = parts[1] ?? "";
            const pStr = firstPart.length > 0 ? trim(firstPart.replace(/^[.\-_ ]+/, "")) : "";
            const tuple: readonly [string, string] = [pStr, secondPart];
            return tuple;
        })()
        : (() => {
            const tuple: readonly [string, string] = [remainder, matchResult[5] ?? ""];
            return tuple;
        })();

    const preRes = parsePrerelease(prereleaseStr, loose);
    if (!preRes.ok) {
        const errorPayload: ParseError = {
            ...preRes.error,
            message: `Prerelease parse error: ${preRes.error.message}`
        };
        return safe.err(errorPayload);
    }
    const prerelease = preRes.value;

    const buildRes = parseBuildMetadata(buildStr);
    if (!buildRes.ok) {
        const errorPayload: ParseError = {
            ...buildRes.error,
            message: `Build metadata parse error: ${buildRes.error.message}`
        };
        return safe.err(errorPayload);
    }
    const buildMetadata = buildRes.value;

    const preString = prerelease.length > 0 
        ? `-${prerelease.map((p: string | number): string => { return p.toString(); }).join(".")}` 
        : "";
    
    const version = `${major.toString()}.${minor.toString()}.${patch.toString()}${preString}`;

    const semverResult: SemVerLike = {
        major,
        minor,
        patch,
        version,
        prerelease,
        ...(buildMetadata.length > 0 && { buildMetadata })
    };

    const finalCheck = safeParse(SemVerSchema, semverResult);
    invariant(finalCheck.success, "Internal validation must pass after parsing");
    
    return safe.ok(Object.freeze(semverResult));
};

export const coerceVersion = (
    raw: string | null | undefined,
    options?: CoerceOptions
): SemVerLike | null => {
    const loose = options?.loose !== false;

    const inputRes = sanitizeInput(raw);
    if (!inputRes.ok) {
        return null;
    }
    const input = inputRes.value;

    const versionRes = parseVersionInternal(input, loose);
    if (!versionRes.ok) {
        return null;
    }

    return versionRes.value;
};

export const compareVersions = (
    v1: string | SemVerLike,
    v2: string | SemVerLike
): -1 | 0 | 1 => {
    if (v1 === v2) { 
        return 0; 
    }

    const s1 = isString(v1) ? coerceVersion(v1) : v1;
    const s2 = isString(v2) ? coerceVersion(v2) : v2;

    if (s1 === null && s2 === null) { 
        return 0; 
    }
    if (s1 === null) { 
        return -1; 
    }
    if (s2 === null) { 
        return 1; 
    }

    invariant(
        typeof s1.major === "number" && typeof s2.major === "number",
        "Parsed versions must have numeric components"
    );

    const coreComparison = match<[number, number, number], -1 | 0 | 1>([
        s1.major - s2.major,
        s1.minor - s2.minor,
        s1.patch - s2.patch
    ])
        .with([P.when((n: number): boolean => { return n > 0; }), P._, P._], (): 1 => { return 1; })
        .with([P.when((n: number): boolean => { return n < 0; }), P._, P._], (): -1 => { return -1; })
        .with([0, P.when((n: number): boolean => { return n > 0; }), P._], (): 1 => { return 1; })
        .with([0, P.when((n: number): boolean => { return n < 0; }), P._], (): -1 => { return -1; })
        .with([0, 0, P.when((n: number): boolean => { return n > 0; })], (): 1 => { return 1; })
        .with([0, 0, P.when((n: number): boolean => { return n < 0; })], (): -1 => { return -1; })
        .with([0, 0, 0], (): 0 => { return 0; })
        .otherwise((): 0 => { return 0; });

    if (coreComparison !== 0) {
        return coreComparison;
    }

    return match<{ len1: number; len2: number }, -1 | 0 | 1>({ 
        len1: s1.prerelease.length, 
        len2: s2.prerelease.length 
    })
        .with({ len1: 0, len2: 0 }, (): 0 => { return 0; })
        .with({ len1: 0, len2: P.not(0) }, (): 1 => { return 1; })
        .with({ len1: P.not(0), len2: 0 }, (): -1 => { return -1; })
        .otherwise((): -1 | 0 | 1 => {
            const maxLen = Math.max(s1.prerelease.length, s2.prerelease.length);
            
            for (let i = 0; i < maxLen; i++) {
                const comparison = match<[IdentifierType, IdentifierType], -1 | 0 | 1>([
                    match(s1.prerelease[i])
                        .with(P.nullish, (): IdentifierType => { return { kind: "undefined" }; })
                        .with(P.number, (n: number): IdentifierType => { return { kind: "numeric", value: n }; })
                        .with(P.string, (s: string): IdentifierType => { return { kind: "alphanumeric", value: s }; })
                        .exhaustive(),
                    match(s2.prerelease[i])
                        .with(P.nullish, (): IdentifierType => { return { kind: "undefined" }; })
                        .with(P.number, (n: number): IdentifierType => { return { kind: "numeric", value: n }; })
                        .with(P.string, (s: string): IdentifierType => { return { kind: "alphanumeric", value: s }; })
                        .exhaustive()
                ])
                    .with([{ kind: "undefined" }, { kind: P.not("undefined") }], (): -1 => { return -1; })
                    .with([{ kind: P.not("undefined" ) }, { kind: "undefined" }], (): 1 => { return 1; })
                    .with([{ kind: "undefined" }, { kind: "undefined" }], (): 0 => { return 0; })
                    .with(
                        [{ kind: "numeric", value: P.select("a") }, { kind: "numeric", value: P.select("b") }],
                        ({ a, b }: { readonly a: number; readonly b: number }): -1 | 0 | 1 => {
                            if (a === b) { 
                                return 0; 
                            }
                            return a > b ? 1 : -1;
                        }
                    )
                    .with([{ kind: "numeric" }, { kind: "alphanumeric" }], (): -1 => { return -1; })
                    .with([{ kind: "alphanumeric" }, { kind: "numeric" }], (): 1 => { return 1; })
                    .with(
                        [{ kind: "alphanumeric", value: P.select("a") }, { kind: "alphanumeric", value: P.select("b") }],
                        ({ a, b }: { readonly a: string; readonly b: string }): -1 | 0 | 1 => {
                            if (a === b) { 
                                return 0; 
                            }
                            return a > b ? 1 : -1;
                        }
                    )
                    .otherwise((): 0 => { return 0; });

                if (comparison !== 0) {
                    return comparison;
                }
            }

            return 0;
        });
};
