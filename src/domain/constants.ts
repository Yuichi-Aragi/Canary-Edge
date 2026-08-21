export const TOKEN_CONSTANTS = {
	PREFIXES: ["ghp_", "github_pat_"],
	REGEXP: /^(gh[ps]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})$/,
} as const;
