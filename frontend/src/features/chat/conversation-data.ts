import type { ThreadMessage } from "@assistant-ui/react";
import { normalizeConversationHistoryMessages as normalizeConversationHistoryMessages_ } from "./history-messages";
export { normalizeConversationHistoryMessages } from "./history-messages";
import type {
	ConversationListItem,
	ConversationListResponse,
	ConversationMessagePayload,
	ConversationRead,
} from "./types";

type ConversationListResponseUpdater = (
	current: ConversationListResponse | undefined,
) => ConversationListResponse;

export function normalizeConversation(
	conversation: ConversationRead | ConversationListItem,
): ConversationListItem {
	return {
		id: conversation.id,
		title: conversation.title,
		status: conversation.status,
		active_document_ids: conversation.active_document_ids ?? [],
		created_at: conversation.created_at,
		updated_at: conversation.updated_at,
		archived_at: conversation.archived_at ?? null,
		message_count: conversation.message_count ?? 0,
	};
}

export function sortConversations(
	conversations: readonly ConversationListItem[],
): ConversationListItem[] {
	return [...conversations].sort(
		(a, b) =>
			new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
	);
}

export function upsertConversationInList(
	current: ConversationListResponse | undefined,
	conversation: ConversationListItem,
): ConversationListResponse {
	const items = current?.items.map(normalizeConversation) ?? [];
	return {
		items: sortConversations([
			conversation,
			...items.filter((item) => item.id !== conversation.id),
		]),
	};
}

export function removeConversationFromList(
	current: ConversationListResponse | undefined,
	conversationId: string,
): ConversationListResponse {
	return {
		items: (current?.items ?? [])
			.map(normalizeConversation)
			.filter((conversation) => conversation.id !== conversationId),
	};
}

export function updateConversationListData(
	updater: ConversationListResponseUpdater,
) {
	return (current: ConversationListResponse | undefined) => updater(current);
}

export function toRuntimeMessages(
	conversation: ConversationRead,
): ThreadMessage[] {
	return normalizeConversationHistoryMessages_(conversation.messages).map(
		(item) => item.message,
	);
}

export function serializeThreadMessage(
	message: ThreadMessage,
): ConversationMessagePayload["message"] {
	return { ...message };
}

export function createConversationMessagePayload({
	parentId,
	message,
	runConfig,
}: {
	parentId: string | null;
	message: ThreadMessage;
	runConfig?: Record<string, unknown>;
}): ConversationMessagePayload {
	return {
		parent_id: parentId,
		message: serializeThreadMessage(message),
		run_config: runConfig ?? null,
	};
}
