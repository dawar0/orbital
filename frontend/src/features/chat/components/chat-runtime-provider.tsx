import { HttpAgent } from "@ag-ui/client";
import type { ThreadMessage } from "@assistant-ui/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "#/lib/api";
import { env } from "#/lib/env";
import { ChatContext, type ViewerSelection } from "../context";
import {
	createConversationMessagePayload,
	normalizeConversation,
	normalizeConversationHistoryMessages,
	toRuntimeMessages,
} from "../conversation-data";
import { useChatDocuments } from "../hooks/use-chat-documents";
import { useConversationListCache } from "../hooks/use-conversation-list-cache";
import { toAssistantRuntime } from "../runtime-compat";
import type { ConversationUpdate } from "../types";
import { ActiveDocumentModelContext } from "./active-document-model-context";

type RuntimeHistoryItem = {
	parentId: string | null;
	message: ThreadMessage;
	runConfig?: Record<string, unknown>;
};

type CreateConversationOptions = {
	activeDocumentIds?: string[];
};

type LoadedConversation = {
	conversation: ConversationUpdateTarget;
	messages: ThreadMessage[];
};

type ConversationUpdateTarget = ReturnType<typeof normalizeConversation>;

const chatAgentUrl = new URL(
	"/agents/chat-agent",
	env.VITE_API_BASE_URL,
).toString();

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
	const [activeConversationId, setActiveConversationId] = useState<
		string | undefined
	>(undefined);
	const [activeDocumentIds, setActiveDocumentIds] = useState<string[]>([]);
	const [selectedViewerItem, setSelectedViewerItem] =
		useState<ViewerSelection | null>(null);
	const activeConversationIdRef = useRef<string | undefined>(undefined);
	const createdConversationIdRef = useRef<string | undefined>(undefined);
	const ensureConversationPromiseRef = useRef<Promise<string> | null>(null);
	const loadedConversationIdRef = useRef<string | undefined>(undefined);
	const pendingNewThreadDocsRef = useRef<string[]>([]);

	const setActiveConversation = useCallback((conversationId: string) => {
		if (activeConversationIdRef.current !== conversationId) {
			setSelectedViewerItem(null);
		}
		activeConversationIdRef.current = conversationId;
		setActiveConversationId(conversationId);
	}, []);

	const { data: conversationsData, isLoading: isConversationsLoading } =
		api.conversations.listConversationHistoryConversationsGet.useQuery(
			undefined,
			{
				throwOnError: false,
			},
		);
	const {
		invalidateConversationDetail,
		invalidateConversationList,
		upsertConversation,
	} = useConversationListCache();
	const { activeDocuments, readyDocuments } =
		useChatDocuments(activeDocumentIds);

	const { mutateAsync: createConversationRequest } =
		api.conversations.createConversationHistoryConversationsPost.useMutation();
	const { mutateAsync: patchConversationRequest } =
		api.conversations.patchConversationHistoryConversationsConversationIdPatch.useMutation();
	const { mutateAsync: deleteConversationRequest } =
		api.conversations.deleteConversationHistoryConversationsConversationIdDelete.useMutation();
	const { mutateAsync: appendMessageRequest } =
		api.conversations.appendMessageToConversationConversationsConversationIdMessagesPost.useMutation();

	const conversations = useMemo(
		() =>
			(conversationsData?.items ?? []).map((conversation) =>
				normalizeConversation(conversation),
			),
		[conversationsData?.items],
	);
	const regularConversations = useMemo(
		() =>
			conversations.filter((conversation) => conversation.status === "regular"),
		[conversations],
	);

	const createBackendConversation = useCallback(
		async (nextActiveDocumentIds: string[] = []) => {
			const raw = await createConversationRequest({
				body: {
					active_document_ids: nextActiveDocumentIds,
				},
			});
			const conversation = normalizeConversation(raw);
			upsertConversation(conversation);
			invalidateConversationList();
			loadedConversationIdRef.current = conversation.id;
			setActiveConversation(conversation.id);
			setActiveDocumentIds(conversation.active_document_ids);
			return conversation;
		},
		[
			createConversationRequest,
			invalidateConversationList,
			setActiveConversation,
			upsertConversation,
		],
	);

	const ensureConversation = useCallback(
		async (nextActiveDocumentIds: string[] = []) => {
			if (activeConversationIdRef.current) {
				return activeConversationIdRef.current;
			}

			if (!ensureConversationPromiseRef.current) {
				ensureConversationPromiseRef.current = createBackendConversation(
					nextActiveDocumentIds,
				)
					.then((conversation) => conversation.id)
					.catch((error) => {
						toast.error("Couldn't create a conversation");
						throw error;
					})
					.finally(() => {
						ensureConversationPromiseRef.current = null;
					});
			}

			return ensureConversationPromiseRef.current;
		},
		[createBackendConversation],
	);

	const loadConversation = useCallback(
		async (conversationId: string): Promise<LoadedConversation> => {
			const raw =
				await api.conversations.getConversationHistoryConversationsConversationIdGet.fetchQuery(
					{
						parameters: { path: { conversation_id: conversationId } },
					},
				);
			const conversation = normalizeConversation(raw);
			upsertConversation(conversation);

			const messages = toRuntimeMessages(raw);

			return {
				conversation,
				messages,
			};
		},
		[upsertConversation],
	);

	const handleSwitchToThread = useCallback(
		async (conversationId: string) => {
			try {
				const loaded = await loadConversation(conversationId);
				loadedConversationIdRef.current = loaded.conversation.id;
				setActiveConversation(loaded.conversation.id);
				setActiveDocumentIds(loaded.conversation.active_document_ids);
				return {
					messages: loaded.messages,
				};
			} catch (error) {
				toast.error("Couldn't load conversation");
				throw error;
			}
		},
		[loadConversation, setActiveConversation],
	);

	const handleSwitchToNewThread = useCallback(async () => {
		try {
			const pendingDocumentIds = pendingNewThreadDocsRef.current;
			createdConversationIdRef.current = ensureConversationPromiseRef.current
				? await ensureConversationPromiseRef.current
				: (await createBackendConversation(pendingDocumentIds)).id;
			loadedConversationIdRef.current = createdConversationIdRef.current;
		} catch (error) {
			toast.error("Couldn't create a conversation");
			throw error;
		}
	}, [createBackendConversation]);

	const appendConversationMessage = useCallback(
		async (conversationId: string, item: RuntimeHistoryItem) => {
			if (item.message.role === "assistant") {
				return;
			}

			await appendMessageRequest({
				path: {
					conversation_id: conversationId,
				},
				body: createConversationMessagePayload(item),
			});
			invalidateConversationList();
			invalidateConversationDetail(conversationId);
		},
		[
			appendMessageRequest,
			invalidateConversationDetail,
			invalidateConversationList,
		],
	);

	const agent = useMemo(
		() =>
			new HttpAgent({
				url: chatAgentUrl,
				threadId: activeConversationId,
			}),
		[activeConversationId],
	);

	const historyAdapter = useMemo(
		() => ({
			load: async () => {
				if (!activeConversationId) {
					return { messages: [] };
				}
				const raw =
					await api.conversations.getConversationHistoryConversationsConversationIdGet.fetchQuery(
						{
							parameters: { path: { conversation_id: activeConversationId } },
						},
					);
				const conversation = normalizeConversation(raw);
				setActiveDocumentIds(conversation.active_document_ids);
				upsertConversation(conversation);
				const messages = normalizeConversationHistoryMessages(raw.messages);
				return {
					messages,
				};
			},
			append: async (item: RuntimeHistoryItem) => {
				const conversationId = await ensureConversation(activeDocumentIds);
				await appendConversationMessage(conversationId, item);
			},
		}),
		[
			activeConversationId,
			activeDocumentIds,
			appendConversationMessage,
			ensureConversation,
			upsertConversation,
		],
	);

	const runtime = useAgUiRuntime({
		agent,
		adapters: {
			history: historyAdapter,
			threadList: {
				threadId: activeConversationId,
				onSwitchToNewThread: handleSwitchToNewThread,
				onSwitchToThread: handleSwitchToThread,
			},
		},
		onError: () => {
			toast.error("Couldn't get a response", {
				description: "Please try again in a moment.",
			});
		},
	});

	const applyLoadedConversation = useCallback(
		({ conversation, messages }: LoadedConversation) => {
			runtime.thread.reset(messages);
			loadedConversationIdRef.current = conversation.id;
		},
		[runtime],
	);

	const switchConversation = useCallback(
		async (conversationId: string) => {
			if (
				conversationId === activeConversationId &&
				loadedConversationIdRef.current === conversationId
			) {
				return conversationId;
			}

			try {
				setSelectedViewerItem(null);
				if (conversationId === activeConversationId) {
					const loaded = await loadConversation(conversationId);
					applyLoadedConversation(loaded);
					setActiveDocumentIds(loaded.conversation.active_document_ids);
					return loaded.conversation.id;
				}

				await runtime.threads.switchToThread(conversationId);
				return conversationId;
			} catch (error) {
				toast.error("Couldn't load conversation");
				throw error;
			}
		},
		[activeConversationId, applyLoadedConversation, loadConversation, runtime],
	);

	const createConversation = useCallback(
		async ({
			activeDocumentIds: nextActiveDocumentIds = [],
		}: CreateConversationOptions = {}) => {
			pendingNewThreadDocsRef.current = nextActiveDocumentIds;
			createdConversationIdRef.current = undefined;
			try {
				await runtime.threads.switchToNewThread();
				const conversationId =
					createdConversationIdRef.current ?? activeConversationIdRef.current;
				if (!conversationId) {
					throw new Error("conversation was not created");
				}
				return conversationId;
			} finally {
				pendingNewThreadDocsRef.current = [];
				createdConversationIdRef.current = undefined;
			}
		},
		[runtime],
	);

	const selectFallbackConversation = useCallback(
		async (removedConversationId: string) => {
			const fallbackConversation = regularConversations.find(
				(conversation) => conversation.id !== removedConversationId,
			);
			if (fallbackConversation) {
				return switchConversation(fallbackConversation.id);
			}
			return createConversation();
		},
		[createConversation, regularConversations, switchConversation],
	);

	const patchConversation = useCallback(
		async (conversationId: string, body: ConversationUpdate) => {
			const conversation = normalizeConversation(
				await patchConversationRequest({
					path: {
						conversation_id: conversationId,
					},
					body,
				}),
			);
			upsertConversation(conversation);
			return conversation;
		},
		[patchConversationRequest, upsertConversation],
	);

	const archiveConversation = useCallback(
		async (conversationId: string) => {
			try {
				await patchConversation(conversationId, { status: "archived" });
				if (conversationId === activeConversationId) {
					await selectFallbackConversation(conversationId);
				}
			} catch (error) {
				toast.error("Couldn't archive conversation");
				throw error;
			}
		},
		[activeConversationId, patchConversation, selectFallbackConversation],
	);

	const deleteConversation = useCallback(
		async (conversationId: string) => {
			try {
				await deleteConversationRequest({
					path: {
						conversation_id: conversationId,
					},
				});
				invalidateConversationList();
				if (conversationId === activeConversationId) {
					await selectFallbackConversation(conversationId);
				}
			} catch (error) {
				toast.error("Couldn't delete conversation");
				throw error;
			}
		},
		[
			activeConversationId,
			deleteConversationRequest,
			invalidateConversationList,
			selectFallbackConversation,
		],
	);

	const persistActiveDocumentIds = useCallback(
		async (documentIds: string[]) => {
			const conversationId = await ensureConversation(documentIds);
			try {
				await patchConversation(conversationId, {
					active_document_ids: documentIds,
				});
			} catch {
				toast.error("Couldn't update active documents");
			}
		},
		[ensureConversation, patchConversation],
	);

	const addActiveDocument = useCallback(
		(documentId: string) => {
			setActiveDocumentIds((current) => {
				if (current.includes(documentId)) {
					return current;
				}
				const next = [...current, documentId];
				void persistActiveDocumentIds(next);
				return next;
			});
		},
		[persistActiveDocumentIds],
	);

	const removeActiveDocument = useCallback(
		(documentId: string) => {
			setActiveDocumentIds((current) => {
				const next = current.filter((id) => id !== documentId);
				void persistActiveDocumentIds(next);
				return next;
			});
		},
		[persistActiveDocumentIds],
	);

	const startChatWithDocument = useCallback(
		async (documentId: string) => {
			return createConversation({ activeDocumentIds: [documentId] });
		},
		[createConversation],
	);

	const selectedCitation =
		selectedViewerItem?.type === "citation"
			? {
					citation: selectedViewerItem.citation,
					index: selectedViewerItem.index,
				}
			: null;
	const setSelectedCitation = useCallback(
		(selection: NonNullable<typeof selectedCitation> | null) => {
			setSelectedViewerItem(
				selection ? { type: "citation", ...selection } : null,
			);
		},
		[],
	);

	const contextValue = useMemo(
		() => ({
			activeConversationId,
			conversations,
			isConversationsLoading,
			activeDocumentIds,
			activeDocuments,
			readyDocuments,
			selectedViewerItem,
			setSelectedViewerItem,
			selectedCitation,
			setSelectedCitation,
			addActiveDocument,
			removeActiveDocument,
			createConversation,
			switchConversation,
			archiveConversation,
			deleteConversation,
			startChatWithDocument,
		}),
		[
			activeConversationId,
			conversations,
			isConversationsLoading,
			activeDocumentIds,
			activeDocuments,
			readyDocuments,
			selectedViewerItem,
			selectedCitation,
			setSelectedCitation,
			addActiveDocument,
			removeActiveDocument,
			createConversation,
			switchConversation,
			archiveConversation,
			deleteConversation,
			startChatWithDocument,
		],
	);

	return (
		<ChatContext.Provider value={contextValue}>
			<AssistantRuntimeProvider runtime={toAssistantRuntime(runtime)}>
				<ActiveDocumentModelContext activeDocumentIds={activeDocumentIds} />
				{children}
			</AssistantRuntimeProvider>
		</ChatContext.Provider>
	);
}
