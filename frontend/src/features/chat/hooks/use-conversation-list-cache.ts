import { useCallback } from "react";
import { api } from "#/lib/api";
import {
	removeConversationFromList,
	updateConversationListData,
	upsertConversationInList,
} from "../conversation-data";
import type { ConversationListItem, ConversationListResponse } from "../types";

export function useConversationListCache() {
	const setConversationListData = useCallback(
		(
			updater: (
				current: ConversationListResponse | undefined,
			) => ConversationListResponse,
		) => {
			api.conversations.listConversationHistoryConversationsGet.setQueryData(
				undefined,
				updateConversationListData(updater),
			);
		},
		[],
	);

	const upsertConversation = useCallback(
		(conversation: ConversationListItem) => {
			setConversationListData((current) =>
				upsertConversationInList(current, conversation),
			);
		},
		[setConversationListData],
	);

	const removeConversationFromCache = useCallback(
		(conversationId: string) => {
			setConversationListData((current) =>
				removeConversationFromList(current, conversationId),
			);
		},
		[setConversationListData],
	);

	const invalidateConversationList = useCallback(() => {
		void api.conversations.listConversationHistoryConversationsGet.invalidateQueries();
	}, []);

	const invalidateConversationDetail = useCallback((conversationId: string) => {
		void api.conversations.getConversationHistoryConversationsConversationIdGet.invalidateQueries(
			{
				parameters: { path: { conversation_id: conversationId } },
			},
		);
	}, []);

	return {
		invalidateConversationDetail,
		invalidateConversationList,
		removeConversationFromCache,
		upsertConversation,
	};
}
