import type { ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";
import {
	createConversationMessagePayload,
	normalizeConversation,
	removeConversationFromList,
	sortConversations,
	toRuntimeMessages,
	upsertConversationInList,
} from "./conversation-data";
import type { ConversationListItem, ConversationRead } from "./types";

const olderDate = "2026-05-04T01:00:00.000Z";
const newerDate = "2026-05-04T02:00:00.000Z";

function makeConversation(
	overrides: Partial<ConversationRead> = {},
): ConversationRead {
	return {
		id: "018f4f7a-2b3c-7d8e-9f01-23456789abcd",
		title: "Chat",
		status: "regular",
		created_at: olderDate,
		updated_at: olderDate,
		...overrides,
	};
}

function makeListItem(
	overrides: Partial<ConversationListItem> = {},
): ConversationListItem {
	return normalizeConversation(makeConversation(overrides));
}

describe("conversation data helpers", () => {
	it("normalizes optional backend defaults into the UI conversation shape", () => {
		expect(normalizeConversation(makeConversation())).toEqual({
			id: "018f4f7a-2b3c-7d8e-9f01-23456789abcd",
			title: "Chat",
			status: "regular",
			active_document_ids: [],
			created_at: olderDate,
			updated_at: olderDate,
			archived_at: null,
			message_count: 0,
		});
	});

	it("sorts and upserts conversations by newest update time", () => {
		const oldConversation = makeListItem({
			id: "018f4f7a-2b3c-7d8e-9f01-23456789abce",
			title: "Old",
			updated_at: olderDate,
		});
		const newConversation = makeListItem({
			id: "018f4f7a-2b3c-7d8e-9f01-23456789abcf",
			title: "New",
			updated_at: newerDate,
		});

		expect(sortConversations([oldConversation, newConversation])).toEqual([
			newConversation,
			oldConversation,
		]);
		expect(
			upsertConversationInList({ items: [oldConversation] }, newConversation),
		).toEqual({
			items: [newConversation, oldConversation],
		});
		expect(
			upsertConversationInList(
				{ items: [oldConversation] },
				{ ...oldConversation, title: "Renamed" },
			),
		).toEqual({
			items: [{ ...oldConversation, title: "Renamed" }],
		});
	});

	it("removes conversations from cached list data", () => {
		const keep = makeListItem({
			id: "018f4f7a-2b3c-7d8e-9f01-23456789abce",
		});
		const remove = makeListItem({
			id: "018f4f7a-2b3c-7d8e-9f01-23456789abcf",
		});

		expect(removeConversationFromList({ items: [keep, remove] }, remove.id))
			.toEqual({
				items: [keep],
			});
	});

	it("restores persisted conversation messages for the runtime", () => {
		const message = {
			id: "message-1",
			role: "user",
			content: [{ type: "text", text: "Hello" }],
			createdAt: "2026-05-04T00:00:00.000Z",
		};

		expect(
			toRuntimeMessages(
				makeConversation({
					messages: [
						{
							id: "018f4f7a-2b3c-7d8e-9f01-23456789abd0",
							message_id: "message-1",
							parent_id: null,
							sort_index: 0,
							created_at: "2026-05-04T00:00:00.000Z",
							message,
							run_config: null,
						},
					],
				}),
			),
		).toMatchObject([
			{
				id: "message-1",
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
		]);
	});

	it("serializes runtime messages at API boundaries", () => {
		const message = {
			id: "message-1",
			role: "user",
			content: [{ type: "text", text: "Hello" }],
			createdAt: new Date("2026-05-04T00:00:00.000Z"),
			attachments: [],
			metadata: { custom: {} },
		} satisfies ThreadMessage;

		expect(
			createConversationMessagePayload({
				parentId: null,
				message,
				runConfig: { custom: { activeDocumentIds: ["doc-1"] } },
			}),
		).toMatchObject({
			parent_id: null,
			message: { id: "message-1", role: "user" },
			run_config: { custom: { activeDocumentIds: ["doc-1"] } },
		});
	});
});
