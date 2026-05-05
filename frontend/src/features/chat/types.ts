import type { components } from "#/lib/api/schema";

export type ConversationStatus =
	components["schemas"]["ConversationStatus"];
export type ConversationRead = components["schemas"]["ConversationRead"];
export type ConversationListResponse =
	components["schemas"]["ConversationListResponse"];
export type ConversationMessagePayload =
	components["schemas"]["ConversationMessagePayload"];
export type ConversationUpdate = components["schemas"]["ConversationUpdate"];

export type ConversationListItem = Omit<
	components["schemas"]["ConversationListItem"],
	"active_document_ids" | "archived_at" | "message_count" | "status"
> & {
	status: ConversationStatus;
	active_document_ids: string[];
	archived_at: string | null;
	message_count: number;
};
