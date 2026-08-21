import type { JSX } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Icon } from "@/ui/components/Icon";
import { usePortalContext } from "@/ui/context/PortalContext";

import type { DetectedUpdate } from "@/domain/types";

export interface TitleMenuContentProps {
	readonly isUntracked: boolean;
	readonly onRegisterUntracked: () => void;
	readonly onCopyUrl: () => void;
	readonly onViewRepo: () => void;
	readonly onViewIssues: () => void;
	readonly onFeatureRequest: () => void;
}

export function TitleMenuContent({
	isUntracked,
	onRegisterUntracked,
	onCopyUrl,
	onViewRepo,
	onViewIssues,
	onFeatureRequest,
}: TitleMenuContentProps): JSX.Element {
	const { portalRef } = usePortalContext();

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="start"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={4}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{isUntracked === true ? (
					<DropdownMenu.Item className="ce-dropdown-item" onSelect={onRegisterUntracked}>
						<Icon name="plus" />
						<span>Register and track this plugin</span>
					</DropdownMenu.Item>
				) : (
					<>
						<DropdownMenu.Item className="ce-dropdown-item" onSelect={onCopyUrl}>
							<Icon name="copy" />
							<span>Copy repository URL</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item className="ce-dropdown-item" onSelect={onViewRepo}>
							<Icon name="external-link" />
							<span>View repository</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item className="ce-dropdown-item" onSelect={onViewIssues}>
							<Icon name="alert-circle" />
							<span>Issues</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item className="ce-dropdown-item" onSelect={onFeatureRequest}>
							<Icon name="git-pull-request" />
							<span>Feature request</span>
						</DropdownMenu.Item>
					</>
				)}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}

export interface UpdateMenuContentProps {
	readonly onTriggerUpdate: () => void;
	readonly onTriggerCheckUpdate: () => void;
}

export function UpdateMenuContent({
	onTriggerUpdate,
	onTriggerCheckUpdate,
}: UpdateMenuContentProps): JSX.Element {
	const { portalRef } = usePortalContext();

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="end"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={4}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				<DropdownMenu.Item className="ce-dropdown-item" onSelect={onTriggerUpdate}>
					<Icon name="refresh-cw" />
					<span>Update it</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item className="ce-dropdown-item" onSelect={onTriggerCheckUpdate}>
					<Icon name="search" />
					<span>Check update</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}

export interface BellMenuContentProps {
	readonly detectedUpdates: readonly DetectedUpdate[];
	readonly onSelectVersion: (update: Readonly<DetectedUpdate>) => void;
}

export function BellMenuContent({
	detectedUpdates,
	onSelectVersion,
}: BellMenuContentProps): JSX.Element {
	const { portalRef } = usePortalContext();

	return (
		<DropdownMenu.Portal {...(portalRef !== null ? { container: portalRef } : {})}>
			<DropdownMenu.Content
				align="start"
				avoidCollisions
				className="ce-dropdown-content"
				sideOffset={4}
				{...(portalRef !== null ? { collisionBoundary: portalRef } : {})}
			>
				{detectedUpdates.map((update): JSX.Element => {
					return (
						<DropdownMenu.Item
							key={update.id}
							className="ce-dropdown-item"
							onSelect={(): void => {
								onSelectVersion(update);
							}}
						>
							<Icon name="tag" />
							<span>v{update.version}</span>
						</DropdownMenu.Item>
					);
				})}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	);
}
