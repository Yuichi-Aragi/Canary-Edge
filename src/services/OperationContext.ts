import { safe } from "@/utils/safe";

import type {
	OperationContext,
	OperationContextOptions,
	OperationGuard,
	OperationType,
	OverrideHandler,
	PluginConfigurationOverrides,
} from "@/domain/types";
import type { Api, Result } from "@/utils/safe";

class OperationContextImpl implements OperationContext {
	public readonly repo: string;
	public readonly operationType: OperationType;
	public readonly signal: AbortSignal;
	public readonly safeCtx: Api;
	public readonly token: string;
	public readonly secretId: string;
	public readonly overrides: PluginConfigurationOverrides | undefined;
	public readonly guard: OperationGuard | undefined;
	public readonly onOverrideRequest: OverrideHandler | undefined;
	public readonly priority: number | undefined;
	public readonly isBulk: boolean | undefined;

	public constructor(options: Readonly<OperationContextOptions>) {
		this.repo = options.repo;
		this.operationType = options.operationType;
		this.signal = options.signal ?? new AbortController().signal;
		this.safeCtx = options.safeCtx ?? safe.with({ signal: this.signal }).bind(this);
		this.token = options.token ?? "";
		this.secretId = options.secretId ?? "";
		this.overrides = options.overrides;
		this.guard = options.guard;
		this.onOverrideRequest = options.onOverrideRequest;
		this.priority = options.priority;
		this.isBulk = options.isBulk;
	}

	public progress(step: string, message: string): Result<undefined> {
		if (this.guard !== undefined) {
			return this.guard.update(step, message);
		}
		return safe.ok(undefined);
	}

	public withGuard(guard: OperationGuard): OperationContext {
		return new OperationContextImpl({
			repo: this.repo,
			operationType: this.operationType,
			signal: this.signal,
			safeCtx: this.safeCtx,
			token: this.token,
			secretId: this.secretId,
			overrides: this.overrides,
			guard,
			onOverrideRequest: this.onOverrideRequest,
			priority: this.priority,
			isBulk: this.isBulk,
		});
	}

	public withToken(token: string, secretId?: string): OperationContext {
		return new OperationContextImpl({
			repo: this.repo,
			operationType: this.operationType,
			signal: this.signal,
			safeCtx: this.safeCtx,
			token,
			secretId: secretId ?? this.secretId,
			overrides: this.overrides,
			guard: this.guard,
			onOverrideRequest: this.onOverrideRequest,
			priority: this.priority,
			isBulk: this.isBulk,
		});
	}

	public withOverrides(overrides?: PluginConfigurationOverrides): OperationContext {
		return new OperationContextImpl({
			repo: this.repo,
			operationType: this.operationType,
			signal: this.signal,
			safeCtx: this.safeCtx,
			token: this.token,
			secretId: this.secretId,
			overrides: overrides ?? this.overrides,
			guard: this.guard,
			onOverrideRequest: this.onOverrideRequest,
			priority: this.priority,
			isBulk: this.isBulk,
		});
	}
}

export const createOperationContext = (options: Readonly<OperationContextOptions>): OperationContext => {
	return new OperationContextImpl(options);
};
