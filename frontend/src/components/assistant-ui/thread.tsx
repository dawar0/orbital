import {
	ActionBarMorePrimitive,
	ActionBarPrimitive,
	AuiIf,
	ComposerPrimitive,
	ErrorPrimitive,
	MessagePrimitive,
	SuggestionPrimitive,
	ThreadPrimitive,
	unstable_useMentionAdapter,
	useAuiState,
} from "@assistant-ui/react";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	CopyIcon,
	DownloadIcon,
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import {
	ComposerAttachments,
	UserMessageAttachments,
} from "#/components/assistant-ui/attachment";
import {
	type AssistantCitation,
	areCitationsEqual,
	CitationPopover,
	extractCitations,
	getCitationKey,
	ThreadCitationsContext,
	useMessageCitations,
} from "#/components/assistant-ui/citations";
import {
	ComposerUploadButton,
	ComposerUploadChips,
	ComposerUploadProvider,
} from "#/components/assistant-ui/composer-document-uploader";
import { MarkdownText } from "#/components/assistant-ui/markdown-text";
import { ToolFallback } from "#/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "#/components/assistant-ui/tooltip-icon-button";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useChat } from "#/features/chat/context";

function ThreadCitationsProvider({ children }: { children: ReactNode }) {
	const { activeConversationId } = useChat();
	const lastAssistantMessageId = useAuiState((s) => {
		for (let index = s.thread.messages.length - 1; index >= 0; index -= 1) {
			const message = s.thread.messages[index];

			if (message?.role === "assistant") {
				return message.id;
			}
		}

		return null;
	});
	const threadState = useAuiState((s) => s.thread.state);
	const [citationsByMessageId, setCitationsByMessageId] = useState<
		Record<string, AssistantCitation[]>
	>({});
	const previousAssistantMessageIdRef = useRef<string | null>(null);
	const previousThreadStateRef = useRef<unknown>(undefined);
	const previousConversationIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		const conversationChanged =
			previousConversationIdRef.current !== activeConversationId;

		if (conversationChanged) {
			previousConversationIdRef.current = activeConversationId;
			previousAssistantMessageIdRef.current = null;
			previousThreadStateRef.current = undefined;
			setCitationsByMessageId({});
			return;
		}

		const assistantMessageChanged =
			previousAssistantMessageIdRef.current !== lastAssistantMessageId;
		const threadStateChanged = previousThreadStateRef.current !== threadState;

		previousAssistantMessageIdRef.current = lastAssistantMessageId;
		previousThreadStateRef.current = threadState;

		if (!lastAssistantMessageId) {
			return;
		}

		// A new assistant message is created before the runtime publishes its next
		// state snapshot. Ignore that transition so we don't copy the previous
		// answer's citations into the new message.
		if (assistantMessageChanged && !threadStateChanged) {
			return;
		}

		const citations = extractCitations(threadState);

		if (citations.length === 0) {
			return;
		}

		setCitationsByMessageId((current) => {
			if (areCitationsEqual(current[lastAssistantMessageId], citations)) {
				return current;
			}

			return {
				...current,
				[lastAssistantMessageId]: citations,
			};
		});
	}, [activeConversationId, lastAssistantMessageId, threadState]);

	return (
		<ThreadCitationsContext.Provider value={citationsByMessageId}>
			{children}
		</ThreadCitationsContext.Provider>
	);
}

export const Thread: FC = () => {
	const { activeConversationId } = useChat();

	return (
		<ThreadCitationsProvider key={activeConversationId ?? "new"}>
			<ThreadPrimitive.Root
				className="aui-root aui-thread-root @container flex h-full min-w-0 flex-1 flex-col bg-background text-sm"
				style={{
					["--thread-max-width" as string]: "44rem",
					["--composer-radius" as string]: "24px",
					["--composer-padding" as string]: "10px",
				}}
			>
				<ThreadPrimitive.Viewport
					turnAnchor="top"
					className="aui-thread-viewport relative flex min-w-0 flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
				>
					<AuiIf condition={(s) => s.thread.isEmpty}>
						<ThreadWelcome />
					</AuiIf>

					<ThreadPrimitive.Messages>
						{() => <ThreadMessage />}
					</ThreadPrimitive.Messages>

					<ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-(--composer-radius) bg-background pb-4 md:pb-6">
						<ThreadScrollToBottom />
						<Composer />
					</ThreadPrimitive.ViewportFooter>
				</ThreadPrimitive.Viewport>
			</ThreadPrimitive.Root>
		</ThreadCitationsProvider>
	);
};

const ThreadMessage: FC = () => {
	const role = useAuiState((s) => s.message.role);
	const isEditing = useAuiState((s) => s.message.composer.isEditing);
	if (isEditing) return <EditComposer />;
	if (role === "user") return <UserMessage />;
	return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
	return (
		<ThreadPrimitive.ScrollToBottom asChild>
			<TooltipIconButton
				tooltip="Scroll to bottom"
				variant="outline"
				className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
			>
				<ArrowDownIcon />
			</TooltipIconButton>
		</ThreadPrimitive.ScrollToBottom>
	);
};

const ThreadWelcome: FC = () => {
	return (
		<div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
			<div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
				<div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
					<h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
						Hello there!
					</h1>
					<p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
						I'm here to help you find and understand information from your
						document library.
					</p>
				</div>
			</div>
			<ThreadSuggestions />
		</div>
	);
};

const ThreadSuggestions: FC = () => {
	return (
		<div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
			<ThreadPrimitive.Suggestions>
				{() => <ThreadSuggestionItem />}
			</ThreadPrimitive.Suggestions>
		</div>
	);
};

const ThreadSuggestionItem: FC = () => {
	return (
		<div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @md:nth-[n+3]:block nth-[n+3]:hidden animate-in fill-mode-both duration-200">
			<SuggestionPrimitive.Trigger send asChild>
				<Button
					variant="ghost"
					className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-3xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
				>
					<SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 font-medium" />
					<SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 text-muted-foreground empty:hidden" />
				</Button>
			</SuggestionPrimitive.Trigger>
		</div>
	);
};

const Composer: FC = () => {
	const mention = useDocumentMentionAdapter();
	const { activeConversationId, isConversationsLoading } = useChat();
	const isReady = Boolean(activeConversationId) && !isConversationsLoading;

	return (
		<ComposerUploadProvider>
			<ComposerPrimitive.Unstable_TriggerPopoverRoot>
				<ComposerPrimitive.Unstable_TriggerPopover
					char="@"
					adapter={mention.adapter}
					className="absolute bottom-full z-40 mb-2 w-full max-w-(--thread-max-width) rounded-2xl border bg-popover p-1 text-popover-foreground shadow-lg"
				>
					<ComposerPrimitive.Unstable_TriggerPopover.Directive
						{...mention.directive}
					/>
					<ComposerPrimitive.Unstable_TriggerPopoverItems>
						{(items) => (
							<div className="max-h-72 overflow-y-auto">
								{items.length === 0 ? (
									<div className="px-3 py-4 text-center text-muted-foreground text-sm">
										No ready documents
									</div>
								) : (
									items.map((item, index) => (
										<ComposerPrimitive.Unstable_TriggerPopoverItem
											key={item.id}
											item={item}
											index={index}
											className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm outline-none data-highlighted:bg-muted"
										>
											<FileTextIcon className="size-4 text-muted-foreground" />
											<span className="min-w-0 flex-1 truncate">
												{item.label}
											</span>
										</ComposerPrimitive.Unstable_TriggerPopoverItem>
									))
								)}
							</div>
						)}
					</ComposerPrimitive.Unstable_TriggerPopoverItems>
				</ComposerPrimitive.Unstable_TriggerPopover>
				<ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
					<ComposerPrimitive.AttachmentDropzone asChild>
						<div
							data-slot="composer-shell"
							className="flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-background p-(--composer-padding) transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
						>
							<ActiveDocumentChips />
							<ComposerUploadChips />
							<ComposerAttachments />
							<ComposerPrimitive.Input
								placeholder={isReady ? "Send a message..." : "Loading chat..."}
								className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
								rows={1}
								autoFocus
								disabled={!isReady}
								aria-label="Message input"
							/>
							<ComposerAction disabled={!isReady} />
						</div>
					</ComposerPrimitive.AttachmentDropzone>
				</ComposerPrimitive.Root>
			</ComposerPrimitive.Unstable_TriggerPopoverRoot>
		</ComposerUploadProvider>
	);
};

function useDocumentMentionAdapter() {
	const { addActiveDocument, readyDocuments } = useChat();

	return unstable_useMentionAdapter({
		includeModelContextTools: false,
		formatter: {
			serialize: () => "",
			parse: (text) => [{ kind: "text", text }],
		},
		onInserted: (item) => {
			addActiveDocument(item.id);
		},
		items: readyDocuments.map((document) => ({
			id: document.id,
			type: "document",
			label: document.title,
			description: document.original_filename,
			icon: "document",
		})),
	});
}

const ActiveDocumentChips: FC = () => {
	const { activeDocuments, removeActiveDocument, setSelectedViewerItem } =
		useChat();

	if (activeDocuments.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-1 px-1">
			{activeDocuments.map((document) => (
				<Badge
					key={document.id}
					variant="outline"
					className="h-6 max-w-56 gap-1 rounded-full pr-1"
				>
					<button
						type="button"
						className="flex min-w-0 items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() =>
							setSelectedViewerItem({
								type: "document",
								documentId: document.id,
								title: document.title,
								pageNumber: null,
							})
						}
						aria-label={`Open ${document.title}`}
					>
						<FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
						<span className="truncate">{document.title}</span>
					</button>
					<button
						type="button"
						className="rounded-full p-0.5 hover:bg-muted"
						onClick={() => removeActiveDocument(document.id)}
						aria-label={`Remove ${document.title}`}
					>
						<XIcon className="size-3" />
					</button>
				</Badge>
			))}
		</div>
	);
};

const ComposerAction: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
	return (
		<div className="aui-composer-action-wrapper relative flex items-center justify-end">
			<div className="mr-auto">
				<ComposerUploadButton />
			</div>
			<AuiIf condition={(s) => !s.thread.isRunning}>
				<ComposerPrimitive.Send asChild>
					<TooltipIconButton
						tooltip="Send message"
						side="bottom"
						type="button"
						variant="default"
						size="icon"
						className="aui-composer-send size-8 rounded-full"
						aria-label="Send message"
						disabled={disabled}
					>
						<ArrowUpIcon className="aui-composer-send-icon size-4" />
					</TooltipIconButton>
				</ComposerPrimitive.Send>
			</AuiIf>
			<AuiIf condition={(s) => s.thread.isRunning}>
				<ComposerPrimitive.Cancel asChild>
					<Button
						type="button"
						variant="default"
						size="icon"
						className="aui-composer-cancel size-8 rounded-full"
						aria-label="Stop generating"
					>
						<SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
					</Button>
				</ComposerPrimitive.Cancel>
			</AuiIf>
		</div>
	);
};

const MessageError: FC = () => {
	return (
		<MessagePrimitive.Error>
			<ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
				<ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
			</ErrorPrimitive.Root>
		</MessagePrimitive.Error>
	);
};

const AssistantSources: FC = () => {
	const citations = useMessageCitations();
	const { setSelectedCitation } = useChat();

	if (citations.length === 0) {
		return null;
	}

	return (
		<div className="mt-4 flex flex-col gap-2">
			<div className="px-1 font-medium text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
				Sources
			</div>
			<ol className="m-0 flex flex-wrap gap-2 p-0">
				{citations.map((citation, index) => (
					<li key={getCitationKey(citation, index)} className="list-none">
						<CitationPopover
							citation={citation}
							onClick={() => setSelectedCitation({ citation, index })}
							className="max-w-full px-3 py-1.5 text-xs"
						>
							<span className="font-medium text-muted-foreground">
								[{index + 1}]
							</span>
							<span className="truncate">
								{citation.document_title || "Document"}
							</span>
						</CitationPopover>
					</li>
				))}
			</ol>
		</div>
	);
};

const AssistantMessage: FC = () => {
	return (
		<MessagePrimitive.Root
			className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
			data-role="assistant"
		>
			<div className="aui-assistant-message-content wrap-break-word px-2 text-foreground leading-relaxed">
				<MessagePrimitive.Parts
					components={{
						Text: MarkdownText,
						tools: {
							Fallback: ToolFallback,
						},
					}}
				/>
				<MessageError />
				<AssistantSources />
			</div>

			<div className="aui-assistant-message-footer mt-1 ml-2 flex min-h-6 items-center">
				<AssistantActionBar />
			</div>
		</MessagePrimitive.Root>
	);
};

const AssistantActionBar: FC = () => {
	return (
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground mt-2"
		>
			<ActionBarPrimitive.Copy asChild>
				<TooltipIconButton tooltip="Copy">
					<AuiIf condition={(s) => s.message.isCopied}>
						<CheckIcon />
					</AuiIf>
					<AuiIf condition={(s) => !s.message.isCopied}>
						<CopyIcon />
					</AuiIf>
				</TooltipIconButton>
			</ActionBarPrimitive.Copy>
			<ActionBarMorePrimitive.Root>
				<ActionBarMorePrimitive.Trigger asChild>
					<TooltipIconButton
						tooltip="More"
						className="data-[state=open]:bg-accent"
					>
						<MoreHorizontalIcon />
					</TooltipIconButton>
				</ActionBarMorePrimitive.Trigger>
				<ActionBarMorePrimitive.Content
					side="bottom"
					align="start"
					className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					<ActionBarPrimitive.ExportMarkdown asChild>
						<ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
							<DownloadIcon className="size-4" />
							Export as Markdown
						</ActionBarMorePrimitive.Item>
					</ActionBarPrimitive.ExportMarkdown>
				</ActionBarMorePrimitive.Content>
			</ActionBarMorePrimitive.Root>
		</ActionBarPrimitive.Root>
	);
};

const UserMessage: FC = () => {
	return (
		<MessagePrimitive.Root
			className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
			data-role="user"
		>
			<UserMessageAttachments />

			<div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
				<div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden">
					<MessagePrimitive.Parts />
				</div>
				<div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
					<UserActionBar />
				</div>
			</div>
		</MessagePrimitive.Root>
	);
};

const UserActionBar: FC = () => {
	return (
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="aui-user-action-bar-root flex flex-col items-end"
		>
			<ActionBarPrimitive.Edit asChild>
				<TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
					<PencilIcon />
				</TooltipIconButton>
			</ActionBarPrimitive.Edit>
		</ActionBarPrimitive.Root>
	);
};

const EditComposer: FC = () => {
	return (
		<MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
			<ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
				<ComposerPrimitive.Input
					className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
					autoFocus
				/>
				<div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
					<ComposerPrimitive.Cancel asChild>
						<Button variant="ghost" size="sm">
							Cancel
						</Button>
					</ComposerPrimitive.Cancel>
					<ComposerPrimitive.Send asChild>
						<Button size="sm">Update</Button>
					</ComposerPrimitive.Send>
				</div>
			</ComposerPrimitive.Root>
		</MessagePrimitive.Root>
	);
};
