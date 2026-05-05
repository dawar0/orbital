import type { ConversationListItem } from "./context";

export const CHAT_PATH = "/chat";

export type ChatRouteSearch = {
	threadId?: string;
};

export type ThreadUrlDecision =
	| { type: "switch"; threadId: string; replaceUrl: boolean }
	| { type: "create" };

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeThreadId(value: unknown): string | undefined {
	return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

export function validateChatSearch(search: Record<string, unknown>): ChatRouteSearch {
	return {
		threadId: normalizeThreadId(search.threadId),
	};
}

export function getFallbackThreadId(
	conversations: readonly ConversationListItem[],
): string | undefined {
	return conversations.find((conversation) => conversation.status === "regular")
		?.id;
}

export function decideThreadForUrl({
	threadId,
	conversations,
}: {
	threadId: string | undefined;
	conversations: readonly ConversationListItem[];
}): ThreadUrlDecision {
	const activeThreadExists =
		threadId !== undefined &&
		conversations.some(
			(conversation) =>
				conversation.id === threadId && conversation.status === "regular",
		);

	if (activeThreadExists) {
		return { type: "switch", threadId, replaceUrl: false };
	}

	const fallbackThreadId = getFallbackThreadId(conversations);
	if (fallbackThreadId) {
		return { type: "switch", threadId: fallbackThreadId, replaceUrl: true };
	}

	return { type: "create" };
}
