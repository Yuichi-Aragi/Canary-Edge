import { compact, take, trim } from "es-toolkit";
import * as v from "valibot";

import { safe } from "@/utils/safe";

const MAX_INPUT_LENGTH: number = 2048;
const MAX_PATH_DEPTH: number = 16;
const MAX_AT_SIGNS: number = 1;
const MAX_SCP_COLONS: number = 1;

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set<string>([
	"http:",
	"https:",
	"ssh:",
	"git:",
]);

const ALLOWED_GITHUB_HOSTS: ReadonlySet<string> = new Set<string>([
	"github.com",
	"www.github.com",
	"api.github.com",
	"raw.githubusercontent.com",
	"gist.github.com",
]);

const STRIPPABLE_PATH_PREFIXES: readonly string[] = [
	"repos/",
	"orgs/",
	"users/",
];

const RESERVED_KEYWORDS: ReadonlySet<string> = new Set<string>([
	"about",
	"blog",
	"contact",
	"enterprise",
	"explore",
	"features",
	"git-lfs",
	"install",
	"issues",
	"join",
	"login",
	"marketplace",
	"messages",
	"notifications",
	"orgs",
	"personal",
	"pricing",
	"pulls",
	"register",
	"search",
	"security",
	"settings",
	"site",
	"sponsors",
	"trending",
	"users",
]);

const FORBIDDEN_SEGMENT_CHARS: ReadonlySet<number> = new Set<number>([
	0x00,
	0x09,
	0x0a,
	0x0d,
	0x20,
	0x22,
	0x23,
	0x25,
	0x27,
	0x3b,
	0x3c,
	0x3e,
	0x3f,
	0x40,
	0x5b,
	0x5c,
	0x5d,
	0x5e,
	0x60,
	0x7b,
	0x7c,
	0x7d,
	0x7e,
	0x7f,
]);

export const RepositoryIdentifierSchema = v.pipe(
	v.string(),
	v.regex(
		/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[a-zA-Z0-9._-]{1,100}$/,
		"Invalid repository format. Must match 'Owner/Repo'",
	),
);

const SingleSegmentSchema = v.pipe(
	v.string(),
	v.regex(
		/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/,
		"Invalid segment format",
	),
);

const containsSurrogates = (input: string): boolean => {
	for (let i: number = 0; i < input.length; i++) {
		const code: number = input.charCodeAt(i);
		if (code >= 0xd800 && code <= 0xdfff) {
			return true;
		}
	}
	return false;
};

const containsDoubleEncoding = (input: string): boolean => {
	for (let i: number = 0; i < input.length - 2; i++) {
		if (
			input.charAt(i) === "%" &&
			input.charAt(i + 1) === "2" &&
			input.charAt(i + 2) === "5"
		) {
			return true;
		}
	}
	return false;
};

const containsEncodedTraversal = (input: string): boolean => {
	const lower: string = input.toLowerCase();
	return (
		lower.includes("%2e") === true ||
		lower.includes("%2f") === true ||
		lower.includes("%5c") === true
	);
};

const stripControlAndFormatChars = (input: string): string => {
	let out: string = "";
	for (let i: number = 0; i < input.length; i++) {
		const code: number = input.charCodeAt(i);
		if ((code >= 0x00 && code <= 0x1f) || code === 0x7f || (code >= 0x80 && code <= 0x9f) || code === 0x00ad) {
			continue;
		}
		out += input.charAt(i);
	}
	return out;
};

const sanitizeRawInput = (raw: string): string => {
	let out: string = raw;

	out = out.replace(
		/[\uFEFF\u200B-\u200F\u2028-\u202F\u2060-\u206F]/g,
		"",
	);

	out = out.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
	out = out.replace(/[\uFE00-\uFE0F]/g, "");
	out = out.replace(/[\uFFF9-\uFFFB]/g, "");
	out = stripControlAndFormatChars(out);
	out = out.replace(/\\/g, "/");
	out = out.normalize("NFKC");

	return out;
};

const stripBrowserIgnoredChars = (input: string): string => {
	let out: string = "";
	for (let i: number = 0; i < input.length; i++) {
		const c: number = input.charCodeAt(i);
		if (c !== 0x09 && c !== 0x0a && c !== 0x0d) {
			out += input.charAt(i);
		}
	}
	return out;
};

const isAllowedGitHubHost = (hostname: string): boolean => {
	if (hostname.includes("[") === true || hostname.includes("]") === true) {
		return false;
	}

	let normalized: string = hostname.toLowerCase();

	while (normalized.endsWith(".") === true) {
		normalized = normalized.slice(0, -1);
	}

	const colonIdx: number = normalized.indexOf(":");
	if (colonIdx !== -1) {
		const port: string = normalized.slice(colonIdx + 1);
		if (port.length === 0 || port.length > 5) {
			return false;
		}
		for (let i: number = 0; i < port.length; i++) {
			const c: number = port.charCodeAt(i);
			if (c < 0x30 || c > 0x39) {
				return false;
			}
		}
		const portNum: number = Number(port);
		if (portNum < 1 || portNum > 65535) {
			return false;
		}
		normalized = normalized.slice(0, colonIdx);
	}

	for (let i: number = 0; i < normalized.length; i++) {
		const c: number = normalized.charCodeAt(i);
		if (c > 0x7e) {
			return false;
		}
	}

	return ALLOWED_GITHUB_HOSTS.has(normalized);
};

const isSafeSegment = (segment: string): boolean => {
	const len: number = segment.length;
	if (len === 0 || len > 100) {
		return false;
	}

	for (let i: number = 0; i < len; i++) {
		const c: number = segment.charCodeAt(i);

		if (c > 0x7e) {
			return false;
		}

		if (FORBIDDEN_SEGMENT_CHARS.has(c) === true) {
			return false;
		}

		const isDigit: boolean = c >= 0x30 && c <= 0x39;
		const isUpper: boolean = c >= 0x41 && c <= 0x5a;
		const isLower: boolean = c >= 0x61 && c <= 0x7a;
		const isSpecial: boolean = c === 0x2d || c === 0x2e || c === 0x5f;

		if (isDigit === false && isUpper === false && isLower === false && isSpecial === false) {
			return false;
		}
	}

	return true;
};

const isTraversalToken = (segment: string): boolean => {
	const lower: string = segment.toLowerCase();
	return (
		lower === ".." ||
		lower === "." ||
		lower === "..;" ||
		lower === ".;" ||
		lower.startsWith("..;") === true ||
		lower.startsWith(".;") === true
	);
};

const extractPathSegments = (
	pathname: string,
): readonly string[] | null => {
	if (pathname.includes(";") === true) {
		return null;
	}

	if (containsEncodedTraversal(pathname) === true) {
		return null;
	}

	const stripped: string = pathname.startsWith("/") === true
		? pathname.slice(1)
		: pathname;

	if (stripped.length === 0) {
		return [];
	}

	const raw: string[] = stripped.split("/");

	if (raw.length > MAX_PATH_DEPTH) {
		return null;
	}

	const segments: string[] = [];

	for (const piece of raw) {
		const trimmedPiece: string = trim(piece);

		if (isTraversalToken(trimmedPiece) === true) {
			return null;
		}

		if (trimmedPiece.length > 0) {
			segments.push(trimmedPiece);
		}
	}

	return segments;
};

const tryParseUrl = (input: string): URL | null => {
	const parsedResult = safe.try((): URL => {
		return new URL(input);
	});
	return parsedResult.ok === true ? parsedResult.value : null;
};

const stripGitSuffix = (segment: string): string => {
	if (segment.length > 4 && segment.slice(-4).toLowerCase() === ".git") {
		return segment.slice(0, -4);
	}
	return segment;
};

const isSafeUserinfo = (url: URL): boolean => {
	const { username, password } = url;

	if (password.length > 0) {
		return false;
	}

	if (username.length === 0) {
		return true;
	}

	if (username.toLowerCase() !== "git") {
		return false;
	}

	return true;
};

const safeDecodeURIComponent = (input: string): string | null => {
	const decodeResult = safe.try((): string => {
		return decodeURIComponent(input);
	});
	return decodeResult.ok === true ? decodeResult.value : null;
};

const buildResultFromSegments = (
	segments: readonly string[],
): string => {
	const cleaned: string[] = segments.map(stripGitSuffix);
	const parts: readonly string[] = compact(cleaned);

	if (parts.length === 0) {
		return "";
	}

	for (const part of parts) {
		if (isSafeSegment(part) === false) {
			return "";
		}
	}

	if (parts.length >= 2) {
		const pair: readonly string[] = take(parts, 2);
		const [owner = "", repo = ""] = pair;

		if (owner.length === 0 || repo.length === 0) {
			return "";
		}

		const candidate: string = `${owner}/${repo}`;
		const result = v.safeParse(RepositoryIdentifierSchema, candidate);
		return result.success === true ? result.output : "";
	}

	if (parts.length === 1) {
		const [single = ""] = parts;

		if (RESERVED_KEYWORDS.has(single.toLowerCase()) === true) {
			return "";
		}

		const result = v.safeParse(SingleSegmentSchema, single);
		return result.success === true ? result.output : "";
	}

	return "";
};

export const scrubRepositoryUrl = (url: string): string => {
	const inputCheck = v.safeParse(v.string(), url);
	if (inputCheck.success === false) {
		return "";
	}

	if (inputCheck.output.length > MAX_INPUT_LENGTH) {
		return "";
	}

	if (containsSurrogates(inputCheck.output) === true) {
		return "";
	}

	if (containsDoubleEncoding(inputCheck.output) === true) {
		return "";
	}

	let clean: string = sanitizeRawInput(inputCheck.output);

	clean = stripBrowserIgnoredChars(clean);
	clean = trim(clean);
	if (clean.length === 0) {
		return "";
	}

	for (let i: number = 0; i < clean.length; i++) {
		if (clean.charCodeAt(i) > 0x7e) {
			return "";
		}
	}

	if (
		clean.length >= 2 &&
		((clean.startsWith('"') === true && clean.endsWith('"') === true) ||
			(clean.startsWith("'") === true && clean.endsWith("'") === true))
	) {
		clean = trim(clean.slice(1, -1));
	}
	if (clean.length === 0) {
		return "";
	}

	const lower: string = clean.toLowerCase();
	if (lower.startsWith("gh:") === true) {
		clean = trim(clean.slice(3));
	} else if (lower.startsWith("github:") === true) {
		clean = trim(clean.slice(7));
	}

	if (clean.toLowerCase().startsWith("git+") === true) {
		clean = clean.slice(4);
	}
	if (clean.length === 0) {
		return "";
	}

	const schemeMatch: number = clean.indexOf("://");
	if (schemeMatch > 0) {
		const scheme: string = clean.slice(0, schemeMatch).toLowerCase();
		if (
			scheme === "javascript" ||
			scheme === "data" ||
			scheme === "file" ||
			scheme === "vbscript" ||
			scheme === "blob" ||
			scheme === "about" ||
			scheme === "obsidian"
		) {
			return "";
		}
	}

	let parsedUrl: URL | null = null;
	let isUrlMode: boolean = false;

	if (isUrlMode === false && clean.includes("://") === true) {
		parsedUrl = tryParseUrl(clean);
		if (parsedUrl !== null) {
			isUrlMode = true;
		}
	}

	if (isUrlMode === false && clean.startsWith("//") === true) {
		parsedUrl = tryParseUrl(`https:${clean}`);
		if (parsedUrl !== null) {
			isUrlMode = true;
		}
	}

	if (isUrlMode === false) {
		const atCount: number = clean.split("@").length - 1;
		if (atCount > MAX_AT_SIGNS) {
			return "";
		}

		const atIdx: number = clean.indexOf("@");
		if (atIdx > 0) {
			const sshUser: string = clean.slice(0, atIdx);

			if (sshUser.toLowerCase() !== "git") {
				return "";
			}

			const afterAt: string = clean.slice(atIdx + 1);
			const colonIdx: number = afterAt.indexOf(":");
			const slashIdx: number = afterAt.indexOf("/");

			const colonCount: number = afterAt.split(":").length - 1;
			if (colonCount > MAX_SCP_COLONS) {
				return "";
			}

			if (colonIdx > 0 && (slashIdx === -1 || colonIdx < slashIdx)) {
				const sshHost: string = afterAt.slice(0, colonIdx);
				const sshPath: string = afterAt.slice(colonIdx + 1);

				if (isAllowedGitHubHost(sshHost) === false) {
					return "";
				}

				parsedUrl = tryParseUrl(
					`ssh://git@${sshHost}/${sshPath}`,
				);
				if (parsedUrl !== null) {
					isUrlMode = true;
				}
			}
		}
	}

	if (isUrlMode === false) {
		const firstSlash: number = clean.indexOf("/");
		if (firstSlash > 0) {
			const candidateHost: string = clean.slice(0, firstSlash).toLowerCase();
			const hostNoPort: string = candidateHost.split(":")[0] ?? "";
			if (isAllowedGitHubHost(hostNoPort) === true) {
				parsedUrl = tryParseUrl(`https://${clean}`);
				if (parsedUrl !== null) {
					isUrlMode = true;
				}
			}
		}
	}

	if (isUrlMode === true && parsedUrl !== null) {
		const { protocol, hostname, port, pathname } = parsedUrl;

		if (ALLOWED_PROTOCOLS.has(protocol) === false) {
			return "";
		}

		if (isSafeUserinfo(parsedUrl) === false) {
			return "";
		}

		if (isAllowedGitHubHost(hostname) === false) {
			return "";
		}

		if (port !== "") {
			const portNum: number = Number(port);
			const isStandard: boolean =
				(protocol === "https:" && portNum === 443) ||
				(protocol === "http:" && portNum === 80) ||
				(protocol === "ssh:" && portNum === 22) ||
				(protocol === "git:" && portNum === 9418);
			if (isStandard === false) {
				return "";
			}
		}

		if (hostname.includes(":") === true) {
			return "";
		}

		let path: string = pathname;

		const decodedPath: string | null = safeDecodeURIComponent(path);
		if (decodedPath === null) {
			return "";
		}

		if (containsEncodedTraversal(decodedPath) === true) {
			return "";
		}

		path = decodedPath;

		const withoutLeadingSlash: string = path.startsWith("/") === true
			? path.slice(1)
			: path;

		for (const prefix of STRIPPABLE_PATH_PREFIXES) {
			if (withoutLeadingSlash.toLowerCase().startsWith(prefix) === true) {
				path = `/${withoutLeadingSlash.slice(prefix.length)}`;
				break;
			}
		}

		const segments: readonly string[] | null = extractPathSegments(path);
		if (segments === null || segments.length === 0) {
			return "";
		}

		return buildResultFromSegments(segments);
	}

	let barePath: string = clean;
	const qIdx: number = barePath.indexOf("?");
	if (qIdx !== -1) {
		barePath = barePath.slice(0, qIdx);
	}
	const hIdx: number = barePath.indexOf("#");
	if (hIdx !== -1) {
		barePath = barePath.slice(0, hIdx);
	}

	barePath = trim(barePath);
	if (barePath.length === 0) {
		return "";
	}

	if (barePath.includes(";") === true) {
		return "";
	}

	const decodedBare: string | null = safeDecodeURIComponent(barePath);
	if (decodedBare === null) {
		return "";
	}
	barePath = decodedBare;

	if (containsEncodedTraversal(barePath) === true) {
		return "";
	}

	while (barePath.startsWith("/") === true) {
		barePath = barePath.slice(1);
	}
	while (barePath.endsWith("/") === true) {
		barePath = barePath.slice(0, -1);
	}
	if (barePath.length === 0) {
		return "";
	}

	const bareSegments: readonly string[] | null = extractPathSegments(barePath);
	if (bareSegments === null || bareSegments.length === 0) {
		return "";
	}

	return buildResultFromSegments(bareSegments);
};
