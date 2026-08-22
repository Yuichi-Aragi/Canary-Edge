import type { JSX, MouseEvent as ReactMouseEvent } from "react";
import { clsx } from "clsx";
import { cva } from "class-variance-authority";

import { Icon } from "@/ui/components/Icon";
import { Button } from "@/ui/components/BaseComponents";
import { CanaryErrorBoundary } from "@/ui/components/CanaryErrorBoundary";
import { useRateLimitDashboardViewModel } from "@/ui/hooks/useRateLimitDashboardViewModel";

import type { RateLimitDashboardViewState, RateLimitDashboardViewActions } from "@/ui/hooks/useRateLimitDashboardViewModel";

export interface RateLimitDashboardProps {
	readonly tokenSecretId?: string | undefined;
}

const barFillVariants = cva("ce-rl-bar-fill", {
	variants: {
		severity: {
			critical: "is-critical",
			warning: "is-warning",
			safe: "is-safe",
		},
	},
	defaultVariants: {
		severity: "safe",
	},
});

const statusBadgeVariants = cva("ce-rl-status-pill", {
	variants: {
		severity: {
			critical: "is-critical",
			warning: "is-warning",
			safe: "is-safe",
		},
	},
	defaultVariants: {
		severity: "safe",
	},
});

function RateLimitSkeleton(): JSX.Element {
	return (
		<div aria-hidden="true" className="ce-rl-skeleton-wrapper">
			<div className="ce-rl-skeleton-header">
				<div className="ce-rl-skeleton sk-title" />
				<div className="ce-rl-skeleton sk-badge" />
			</div>
			<div className="ce-rl-skeleton sk-meter-row" />
			<div className="ce-rl-skeleton sk-bar" />
			<div className="ce-rl-skeleton sk-meta" />
		</div>
	);
}

interface RateLimitViewProps {
	readonly state: RateLimitDashboardViewState;
	readonly actions: RateLimitDashboardViewActions;
}

function RateLimitDashboardView({ state, actions }: RateLimitViewProps): JSX.Element {
	const { 
		metrics, 
		rateLimit, 
		isAnonymous, 
		isLoading, 
		isError, 
		isBusy, 
		error, 
	} = state;

	if (isLoading && rateLimit === undefined) {
		return (
			<div className="ce-rate-limit-dashboard is-loading">
				<RateLimitSkeleton />
			</div>
		);
	}

	if ((isError && rateLimit === undefined) || rateLimit === undefined || metrics === null) {
		return (
			<div aria-live="polite" className="ce-rate-limit-dashboard is-error-state" role="alert">
				<div className="ce-rl-error-inner">
					<Icon className="ce-rl-error-icon" name="alert-triangle" />
					<div className="ce-rl-error-details">
						<span className="ce-rl-error-heading">Rate Limit Unavailable</span>
						<span className="ce-rl-error-text">
							{error !== null ? error.message : "Unable to synchronize with GitHub API"}
						</span>
					</div>
				</div>
				<Button 
					className="ce-rl-retry-btn"
					disabled={isBusy}
					size="sm" 
					text="Retry" 
					variant="cta"
					onClick={actions.handleManualRefresh} 
				/>
			</div>
		);
	}

	const { percentRemaining, severity, healthText, resetTimeStr, updateTimeStr } = metrics;
	const formattedRemaining = rateLimit.remaining.toLocaleString();
	const formattedLimit = rateLimit.limit.toLocaleString();
	const formattedUsed = rateLimit.used.toLocaleString();
	const formattedPercent = `${percentRemaining.toFixed(0)}%`;

	return (
		<div aria-label="GitHub API Rate Limits" className="ce-rate-limit-dashboard" role="region">
			<div className="ce-rl-header-row">
				<div className="ce-rl-header-left">
					<div className="ce-rl-title-group">
						<span className="ce-rl-title">API Quota</span>
					</div>
					<span className={clsx("ce-rl-auth-badge", isAnonymous ? "is-anonymous" : "is-pat")}>
						{isAnonymous ? "Anonymous" : "PAT Active"}
					</span>
				</div>

				<div className="ce-rl-header-right">
					<span className={clsx(statusBadgeVariants({ severity }))}>
						<span className="ce-rl-status-dot" />
						{healthText}
					</span>
					<button
						aria-label="Refresh API quota status"
						className={clsx("ce-rl-refresh-btn", isBusy ? "is-spinning" : "")}
						disabled={isBusy}
						title={isBusy ? "Refreshing quota..." : "Refresh quota"}
						type="button"
						onClick={(e: ReactMouseEvent): void => {
							e.preventDefault();
							if (!isBusy) {
								actions.handleManualRefresh();
							}
						}}
					>
						<Icon name="refresh-cw" />
					</button>
				</div>
			</div>

			<div className="ce-rl-meter-section">
				<div className="ce-rl-meter-metrics">
					<div className="ce-rl-count-display">
						<span className="ce-rl-count-main">{formattedRemaining}</span>
						<span className="ce-rl-count-delimiter">/</span>
						<span className="ce-rl-count-total">{formattedLimit}</span>
						<span className="ce-rl-count-unit">req remaining</span>
					</div>
					<span className={clsx("ce-rl-percentage-tag", `is-${severity}`)}>
						{formattedPercent}
					</span>
				</div>

				<div 
					aria-label="API quota remaining"
					aria-valuemax={rateLimit.limit}
					aria-valuemin={0}
					aria-valuenow={rateLimit.remaining}
					aria-valuetext={`${percentRemaining.toFixed(1)}% quota remaining`}
					className="ce-rl-bar-container"
					role="progressbar"
				>
					<div 
						className={clsx(barFillVariants({ severity }))} 
						style={{ width: `${percentRemaining.toFixed(1)}%` }} 
					/>
				</div>
			</div>

			<div className="ce-rl-meta-strip">
				<div className="ce-rl-meta-item">
					<span className="ce-rl-meta-label">Used</span>
					<span className="ce-rl-meta-value">{formattedUsed}</span>
				</div>
				<div className="ce-rl-meta-divider" />
				<div className="ce-rl-meta-item">
					<span className="ce-rl-meta-label">Resets In</span>
					<span className="ce-rl-meta-value">{resetTimeStr}</span>
				</div>
				<div className="ce-rl-meta-divider" />
				<div className="ce-rl-meta-item mod-resource" title={`API Resource Context: ${rateLimit.resource}`}>
					<span className="ce-rl-meta-label">Resource</span>
					<span className="ce-rl-meta-value">{rateLimit.resource}</span>
				</div>
			</div>

			{isAnonymous ? (
				<div className="ce-rl-education-compact" role="note">
					<div className="ce-rl-education-content">
						<span>
							<strong>60 req/hr cap.</strong> Select a Personal Access Token below to unlock <strong>5,000 req/hr</strong>.
						</span>
					</div>
				</div>
			) : null}

			<div className="ce-rl-subfooter">
				<span className="ce-rl-synced-time">
					Updated {updateTimeStr}
				</span>
			</div>
		</div>
	);
}

export function RateLimitDashboard({ tokenSecretId }: RateLimitDashboardProps): JSX.Element {
	const vm = useRateLimitDashboardViewModel(tokenSecretId);

	return (
		<CanaryErrorBoundary variant="card">
			<RateLimitDashboardView 
				actions={vm.actions}
				state={vm.state}
			/>
		</CanaryErrorBoundary>
	);
}
