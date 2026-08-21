
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import * as v from "valibot";

import { safe } from "./safe";

import type { Element as HastElement, Root as HastRoot } from "hast";
import type { Definition as MdastDefinition, Image as MdastImage, Link as MdastLink, Root as MdastRoot } from "mdast";
import type { Plugin as UnifiedPlugin } from "unified";
import type { Result } from "./safe";


const RepoConfigSchema = v.object({
	repo: v.pipe(
		v.string(),
		v.regex(/^[^/]+\/[^/]+$/, "repo must be in 'owner/repo' format")
	),
	ref: v.optional(v.pipe(v.string(), v.minLength(1)), "HEAD"),
});

type RepoConfig = v.InferOutput<typeof RepoConfigSchema>;

interface UrlContext {
	readonly rawBaseUrl: string;
	readonly blobBaseUrl: string;
	readonly repo: string;
	readonly ref: string;
}


type UrlKind =
	| { readonly type: "absolute_external" }
	| { readonly type: "fragment_only" }
	| { readonly type: "data_uri" }
	| { readonly type: "github_blob"; readonly rawPath: string }
	| { readonly type: "github_raw" }
	| { readonly type: "github_user_attachment" }
	| { readonly type: "relative"; readonly resolvedPath: string };

const PROTOCOL_RE = /^[a-z][a-z0-9+\-.]*:/i;
const GITHUB_BLOB_RE =
	/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/;
const GITHUB_RAW_RE = /^https?:\/\/raw\.githubusercontent\.com\//;
const GITHUB_USER_ATTACHMENT_RE =
	/^https?:\/\/(?:github\.com\/user-attachments|github\.user-attachments|private-user-images\.githubusercontent\.com)\//;

function classifyUrl(url: string, _ctx: UrlContext): UrlKind {
	const trimmed = url.trim();

	if (trimmed.length === 0) {
		return { type: "absolute_external" };
	}

	if (trimmed.startsWith("#")) {
		return { type: "fragment_only" };
	}

	if (trimmed.startsWith("data:")) {
		return { type: "data_uri" };
	}

	if (GITHUB_USER_ATTACHMENT_RE.test(trimmed)) {
		return { type: "github_user_attachment" };
	}

	if (GITHUB_RAW_RE.test(trimmed)) {
		return { type: "github_raw" };
	}

	const blobMatch = GITHUB_BLOB_RE.exec(trimmed);
	if (blobMatch !== null) {
		const rawPath = blobMatch[3];
		if (rawPath === undefined || rawPath.length === 0) {
			throw new Error("Invalid GitHub blob URL: missing raw path capture group");
		}
		return { type: "github_blob", rawPath };
	}

	if (PROTOCOL_RE.test(trimmed)) {
		return { type: "absolute_external" };
	}

	return {
		type: "relative",
		resolvedPath: resolveRelativePath(trimmed),
	};
}


function resolveRelativePath(rawPath: string): string {
	let p = rawPath;
	while (p.startsWith("./")) {
		p = p.substring(2);
	}

	const segments = p.split("/");
	const resolved: string[] = [];

	for (const seg of segments) {
		if (seg === "." || seg === "") {
			continue;
		}
		if (seg === "..") {
			resolved.pop();
		} else {
			resolved.push(seg);
		}
	}

	return resolved.join("/");
}

function splitUrlComponents(url: string): {
	readonly path: string;
	readonly suffix: string;
} {
	const hashIdx = url.indexOf("#");
	const queryIdx = url.indexOf("?");

	let splitIdx = -1;
	if (hashIdx !== -1 && queryIdx !== -1) {
		splitIdx = Math.min(hashIdx, queryIdx);
	} else if (hashIdx !== -1) {
		splitIdx = hashIdx;
	} else if (queryIdx !== -1) {
		splitIdx = queryIdx;
	}

	if (splitIdx === -1) {
		return { path: url, suffix: "" };
	}
	return { path: url.substring(0, splitIdx), suffix: url.substring(splitIdx) };
}


type AssetTarget = "raw" | "blob";

function rewriteUrl(
	url: string,
	ctx: UrlContext,
	target: AssetTarget
): string {
	const { path: urlPath, suffix } = splitUrlComponents(url);
	const kind = classifyUrl(urlPath, ctx);

	switch (kind.type) {
		case "absolute_external":
		case "fragment_only":
		case "data_uri":
		case "github_user_attachment":
		case "github_raw": {
			return url;
		}
		case "github_blob": {
			if (target === "raw") {
				const blobMatch = GITHUB_BLOB_RE.exec(urlPath);
				if (blobMatch === null) {
					throw new Error(`Expected GitHub blob match for URL path: ${urlPath}`);
				}

				const matchedRepo = blobMatch[1];
				const matchedRef = blobMatch[2];

				if (matchedRepo === undefined || matchedRef === undefined) {
					throw new Error(`Malformed GitHub blob capture groups for URL path: ${urlPath}`);
				}

				return `https://raw.githubusercontent.com/${matchedRepo}/${matchedRef}/${kind.rawPath}${suffix}`;
			}
			return url;
		}
		case "relative": {
			const base = target === "raw" ? ctx.rawBaseUrl : ctx.blobBaseUrl;
			return `${base}/${kind.resolvedPath}${suffix}`;
		}
	}
}


function remarkRewriteUrls(ctx: UrlContext): UnifiedPlugin<[], MdastRoot> {
	return function (): (tree: MdastRoot) => void {
		return function (tree: MdastRoot): void {
			visit(tree, (node: unknown): void => {
				if (node === null || typeof node !== "object") {
					return;
				}

				const record = node as Record<string, unknown>;
				const nodeType = record["type"];
				const nodeUrl = record["url"];

				if (typeof nodeUrl !== "string") {
					return;
				}

				if (nodeType === "image") {
					(record as unknown as MdastImage).url = rewriteUrl(nodeUrl, ctx, "raw");
				} else if (nodeType === "link") {
					const target: AssetTarget = isLikelyAssetPath(nodeUrl) ? "raw" : "blob";
					(record as unknown as MdastLink).url = rewriteUrl(nodeUrl, ctx, target);
				} else if (nodeType === "definition") {
					const target: AssetTarget = isLikelyAssetPath(nodeUrl) ? "raw" : "blob";
					(record as unknown as MdastDefinition).url = rewriteUrl(nodeUrl, ctx, target);
				}
			});
		};
	};
}


function remarkRewriteHtmlNodes(ctx: UrlContext): UnifiedPlugin<[], MdastRoot> {
	return function (): (tree: MdastRoot) => void {
		return function (tree: MdastRoot): void {
			visit(tree, "html", (node: { value: string }): void => {
				const result = safe.try((): string => {
					const processed = unified()
						.use(rehypeParse, { fragment: true })
						.use(rehypeRewriteUrls(ctx))
						.use(rehypeStringify, { allowDangerousHtml: true })
						.processSync(node.value);

					return String(processed);
				});

				if (result.ok === true) {
					node.value = result.value;
				} else {
					console.warn("Canary Edge: Failed to rewrite inline HTML", result.error);
				}
			});
		};
	};
}


const RESOURCE_ATTR_MAP: ReadonlyMap<string, readonly string[]> = new Map([
	["img", ["src", "srcset"]],
	["video", ["src", "poster"]],
	["audio", ["src"]],
	["source", ["src", "srcset"]],
	["a", ["href"]],
	["link", ["href"]],
	["object", ["data"]],
	["embed", ["src"]],
	["iframe", ["src"]],
	["picture", ["src"]],
]);

const RAW_ATTRIBUTES: ReadonlySet<string> = new Set([
	"src",
	"poster",
	"data",
	"srcset",
]);

function rehypeRewriteUrls(ctx: UrlContext): UnifiedPlugin<[], HastRoot> {
	return function (): (tree: HastRoot) => void {
		return function (tree: HastRoot): void {
			visit(tree, "element", (node: HastElement): void => {
				const tagName = node.tagName.toLowerCase();
				const attrs = RESOURCE_ATTR_MAP.get(tagName);

				if (attrs === undefined) {
					return;
				}

				for (const attr of attrs) {
					const value = node.properties[attr];
					if (typeof value !== "string" || value.length === 0) {
						continue;
					}

					if (attr === "srcset") {
						node.properties[attr] = rewriteSrcset(value, ctx);
					} else {
						let target: AssetTarget = "raw";
						if (tagName === "a" && attr === "href") {
							target = isLikelyAssetPath(value) ? "raw" : "blob";
						} else if (RAW_ATTRIBUTES.has(attr)) {
							target = "raw";
						}

						node.properties[attr] = rewriteUrl(value, ctx, target);
					}
				}
			});
		};
	};
}

function rewriteSrcset(srcset: string, ctx: UrlContext): string {
	return srcset
		.split(",")
		.map((entry: string): string => {
			const trimmed = entry.trim();
			const parts = trimmed.split(/\s+/);
			const urlPart = parts[0];

			if (urlPart === undefined || urlPart.length === 0) {
				return trimmed;
			}

			const rest = parts.slice(1).join(" ");
			const rewritten = rewriteUrl(urlPart, ctx, "raw");
			return rest.length > 0 ? `${rewritten} ${rest}` : rewritten;
		})
		.join(", ");
}


const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
	".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".tiff", ".tif", ".avif",
	".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi",
	".mp3", ".wav", ".flac", ".aac", ".m4a",
	".pdf", ".json", ".xml", ".csv", ".zip", ".tar", ".gz", ".woff", ".woff2", ".ttf", ".eot",
]);

function isLikelyAssetPath(url: string): boolean {
	const { path: urlPath } = splitUrlComponents(url);

	if (PROTOCOL_RE.test(urlPath)) {
		const blobMatch = GITHUB_BLOB_RE.exec(urlPath);
		if (blobMatch !== null) {
			const filePath = blobMatch[3];
			if (filePath !== undefined && filePath.length > 0) {
				return hasAssetExtension(filePath);
			}
		}
		return false;
	}

	return hasAssetExtension(urlPath);
}

function hasAssetExtension(path: string): boolean {
	const dotIdx = path.lastIndexOf(".");
	if (dotIdx === -1) {
		return false;
	}
	const ext = path.substring(dotIdx).toLowerCase();
	return ASSET_EXTENSIONS.has(ext);
}

function buildContext(config: RepoConfig): UrlContext {
	const { repo, ref } = config;
	return {
		rawBaseUrl: `https://raw.githubusercontent.com/${repo}/${ref}`,
		blobBaseUrl: `https://github.com/${repo}/blob/${ref}`,
		repo,
		ref,
	};
}


export function rewriteMdResourceUrls(
	markdown: string,
	repo: string,
	ref = "HEAD"
): Result<string> {
	const configParse = v.safeParse(RepoConfigSchema, { repo, ref });
	if (configParse.success === false) {
		return safe.err(new Error(`Invalid repo config: repo="${repo}", ref="${ref}"`));
	}

	const config = configParse.output;
	const ctx = buildContext(config);

	return safe.try((): string => {
		const file = unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkRewriteUrls(ctx))
			.use(remarkRewriteHtmlNodes(ctx))
			.use(remarkStringify, {
				listItemIndent: "one",
				resourceLink: true,
				rule: "-",
				emphasis: "_",
			})
			.processSync(markdown);

		return String(file);
	});
}
