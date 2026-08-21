import type { App } from "obsidian";
import { match, P } from "ts-pattern";
import { TOKEN_CONSTANTS } from "@/domain/constants";
import type { SecretStorage } from "@/domain/types";

interface AppWithSecrets {
	secretStorage?: SecretStorage;
}

export function resolveToken(app: App, secretId: string | undefined | null): string {
	return match(secretId)
		.with(P.nullish, (): string => "")
		.with("", (): string => "")
		.otherwise((id: string): string => {
			const appWithSecrets = app as unknown as AppWithSecrets;
			const storage = appWithSecrets.secretStorage;

			return match(storage)
				.with(P.nullish, (): string => {
					console.warn("Canary Edge: Secret Storage API not available.");
					return "";
				})
				.otherwise((s: SecretStorage): string => {
					const secret = s.getSecret(id);
					return match(secret)
						.with(P.when((val: unknown): val is string => typeof val === "string" && TOKEN_CONSTANTS.REGEXP.test(val)), (val: string): string => val)
						.otherwise((): string => "");
				});
		});
}

export function getAvailableSecrets(app: App): string[] {
	const appWithSecrets = app as unknown as AppWithSecrets;
	const storage = appWithSecrets.secretStorage;
	
	return match(storage)
		.with(P.nullish, (): string[] => [])
		.otherwise((s: SecretStorage): string[] => s.listSecrets());
}
