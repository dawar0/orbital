import { useNavigate } from "@tanstack/react-router";
import {
	ArchiveIcon,
	MoreHorizontalIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import type { FC } from "react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
import { type ConversationListItem, useChat } from "#/features/chat/context";
import { CHAT_PATH } from "#/features/chat/thread-url";

const THREAD_LIST_SKELETON_IDS = [
	"thread-list-skeleton-1",
	"thread-list-skeleton-2",
	"thread-list-skeleton-3",
	"thread-list-skeleton-4",
	"thread-list-skeleton-5",
] as const;

export const ThreadList: FC = () => {
	const navigate = useNavigate();
	const {
		activeConversationId,
		conversations,
		isConversationsLoading,
		createConversation,
		switchConversation,
		archiveConversation,
		deleteConversation,
	} = useChat();
	const regularConversations = conversations.filter(
		(conversation) => conversation.status === "regular",
	);

	const openNewChat = () => {
		void (async () => {
			const threadId = await createConversation();
			await navigate({ to: CHAT_PATH, search: { threadId } });
		})().catch(() => {});
	};

	const openConversation = (conversationId: string) => {
		void (async () => {
			await switchConversation(conversationId);
			await navigate({
				to: CHAT_PATH,
				search: { threadId: conversationId },
			});
		})().catch(() => {});
	};

	return (
		<div className="aui-root aui-thread-list-root flex flex-col gap-1">
			<Button
				type="button"
				variant="outline"
				className="aui-thread-list-new h-9 justify-start gap-2 rounded-lg px-3 text-sm hover:bg-muted data-active:bg-muted"
				onClick={openNewChat}
			>
				<PlusIcon className="size-4" />
				New chat
			</Button>
			{isConversationsLoading ? (
				<ThreadListSkeleton />
			) : (
				regularConversations.map((conversation) => (
					<ThreadListItem
						key={conversation.id}
						conversation={conversation}
						isActive={conversation.id === activeConversationId}
						onSwitch={() => {
							openConversation(conversation.id);
						}}
						onArchive={() => {
							void archiveConversation(conversation.id).catch(() => {});
						}}
						onDelete={() => {
							void deleteConversation(conversation.id).catch(() => {});
						}}
					/>
				))
			)}
		</div>
	);
};

const ThreadListSkeleton: FC = () => {
	return (
		<div className="flex flex-col gap-1">
			{THREAD_LIST_SKELETON_IDS.map((skeletonId) => (
				<output
					key={skeletonId}
					aria-label="Loading threads"
					className="aui-thread-list-skeleton-wrapper flex h-9 items-center px-3"
				>
					<Skeleton className="aui-thread-list-skeleton h-4 w-full" />
				</output>
			))}
		</div>
	);
};

const ThreadListItem: FC<{
	conversation: ConversationListItem;
	isActive: boolean;
	onSwitch: () => void;
	onArchive: () => void;
	onDelete: () => void;
}> = ({ conversation, isActive, onSwitch, onArchive, onDelete }) => {
	const title = conversation.title.trim() || "New Chat";

	return (
		<div
			className="aui-thread-list-item group flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted focus-within:bg-muted data-active:bg-muted"
			data-active={isActive ? "" : undefined}
		>
			<button
				type="button"
				className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center px-3 text-start text-sm"
				aria-current={isActive ? "page" : undefined}
				onClick={onSwitch}
			>
				<span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
					{title}
				</span>
			</button>
			<ThreadListItemMore
				title={title}
				onArchive={onArchive}
				onDelete={onDelete}
			/>
		</div>
	);
};

const ThreadListItemMore: FC<{
	title: string;
	onArchive: () => void;
	onDelete: () => void;
}> = ({ title, onArchive, onDelete }) => {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="aui-thread-list-item-more mr-2 size-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100 group-data-active:opacity-100"
					aria-label={`Open options for ${title}`}
				>
					<MoreHorizontalIcon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="bottom"
				align="start"
				className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
			>
				<DropdownMenuItem
					className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
					onSelect={onArchive}
				>
					<ArchiveIcon className="size-4" />
					Archive
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
					onSelect={onDelete}
				>
					<TrashIcon className="size-4" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
