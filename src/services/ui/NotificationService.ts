import { Notice, Platform } from "obsidian";
import { match } from "ts-pattern";

import { getFriendlyErrorMessage } from "@/domain/errorMessages";
import { canaryToast } from "@/ui/components/toast/canaryToast";
import { safe } from "@/utils/safe";

import type { AppNotificationOptions, Cradle, NotificationHandle, NotificationLevel } from "@/domain/types";
import type { CanaryToastOptions } from "@/ui/components/toast/types";
import type { Result } from "@/utils/safe";

const NOTICE_DEFAULT_TIMEOUT_SECONDS = 10;
const APP_NAME = "Canary Edge";

export class NotificationService {
	private readonly safeCtx = safe.bind(this);
	private disposed = false;

	public constructor(private readonly deps: Readonly<Cradle>) {}

	public dispose(): void {
		if (this.disposed === true) {
			return;
		}
		this.disposed = true;
	}

	public show(
		content: unknown,
		options?: Readonly<AppNotificationOptions>,
		level: NotificationLevel = "info",
	): Result<NotificationHandle> {
		return this.safeCtx(($) => {
			$.checkpoint();
			const timeout = options?.timeout ?? NOTICE_DEFAULT_TIMEOUT_SECONDS;
			const isCEWindowOpen = this.deps.canaryStore.getIsCEWindowOpen();
			const duration = timeout === 0 ? Number.POSITIVE_INFINITY : timeout * 1000;

			const userFriendlyMessage = match(level)
				.with("error", (): string => {
					return getFriendlyErrorMessage(content, options?.context);
				})
				.otherwise((): string => {
					if (typeof content === "string") {
						const trimmed = content.trim();
						if (options?.context !== undefined && options.context.trim() !== "") {
							return `${options.context.trim()} ${trimmed}`;
						}
						return trimmed;
					}
					return getFriendlyErrorMessage(content, options?.context);
				});

			if (isCEWindowOpen === true) {
				const toastFn = match(level)
					.with("error", (): typeof canaryToast.error => {
						return canaryToast.error;
					})
					.with("warn", (): typeof canaryToast.warning => {
						return canaryToast.warning;
					})
					.otherwise((): typeof canaryToast.info => {
						return canaryToast.info;
					});

				const toastOptions: CanaryToastOptions = {
					dismissible: true,
					duration,
				};

				const toastId = toastFn(userFriendlyMessage, toastOptions);

				return {
					updateMessage: (newMessage: unknown): Result<undefined> => {
						return this.safeCtx(($inner) => {
							$inner.checkpoint();
							const resolvedNewMessage =
								typeof newMessage === "string"
									? newMessage.trim()
									: getFriendlyErrorMessage(newMessage);

							toastFn(resolvedNewMessage, {
								id: toastId,
								duration,
								dismissible: true,
							});
							return undefined;
						});
					},
					hide: (): Result<undefined> => {
						return this.safeCtx(($inner) => {
							$inner.checkpoint();
							canaryToast.dismiss(toastId);
							return undefined;
						});
					},
				};
			}

			const nativeDuration = timeout === 0 ? 0 : timeout * 1000;

			let additionalInfo = "";
			if (options?.contextMenuCallback !== undefined) {
				additionalInfo =
					Platform.isDesktop === true ? "(click=dismiss, right-click=Info)" : "(click=dismiss)";
			}

			const fullMessage = `${APP_NAME}\n${userFriendlyMessage}${additionalInfo !== "" ? `\n${additionalInfo}` : ""}`;
			const notice = new Notice(fullMessage, nativeDuration);

			if (options?.contextMenuCallback !== undefined) {
				const internalNotice = notice as unknown as { readonly messageEl?: HTMLElement };
				if (internalNotice.messageEl !== undefined && internalNotice.messageEl !== null) {
					internalNotice.messageEl.oncontextmenu = (e: MouseEvent): void => {
						e.preventDefault();
						options.contextMenuCallback?.();
					};
				}
			}

			return {
				updateMessage: (newMessage: unknown): Result<undefined> => {
					return this.safeCtx(($inner) => {
						$inner.checkpoint();
						const resolvedNewMessage =
							typeof newMessage === "string"
								? newMessage.trim()
								: getFriendlyErrorMessage(newMessage);

						const updatedText = `${APP_NAME}\n${resolvedNewMessage}${additionalInfo !== "" ? `\n${additionalInfo}` : ""}`;
						notice.setMessage(updatedText);
						return undefined;
					});
				},
				hide: (): Result<undefined> => {
					return this.safeCtx(($inner) => {
						$inner.checkpoint();
						notice.hide();
						return undefined;
					});
				},
			};
		});
	}
}
