import { describe, expect, it } from "vitest";
import type { ConversationListItem } from "./context";
import {
	decideThreadForUrl,
	getFallbackThreadId,
	normalizeThreadId,
} from "./thread-url";

const makeConversation = (
	id: string,
	status: ConversationListItem["status"] = "regular",
): ConversationListItem => ({
	id,
	title: "Chat",
	status,
	active_document_ids: [],
	created_at: "2026-05-04T00:00:00.000Z",
	updated_at: "2026-05-04T00:00:00.000Z",
	archived_at: null,
	message_count: 0,
});

const threadA = "018f4f7a-2b3c-7d8e-9f01-23456789abcd";
const threadB = "018f4f7a-2b3c-7d8e-9f01-23456789abce";
const missingThread = "018f4f7a-2b3c-7d8e-9f01-23456789abcf";

describe("thread URL helpers", () => {
	it("accepts UUID thread ids and rejects malformed values", () => {
		expect(normalizeThreadId(threadA)).toBe(threadA);
		expect(normalizeThreadId("not-a-thread")).toBeUndefined();
		expect(normalizeThreadId(null)).toBeUndefined();
	});

	it("uses a valid URL thread id when the conversation exists", () => {
		expect(
			decideThreadForUrl({
				threadId: threadB,
				conversations: [makeConversation(threadA), makeConversation(threadB)],
			}),
		).toEqual({
			type: "switch",
			threadId: threadB,
			replaceUrl: false,
		});
	});

	it("falls back to the newest regular conversation when the URL id is missing or stale", () => {
		const conversations = [
			makeConversation(threadA),
			makeConversation(threadB, "archived"),
		];

		expect(getFallbackThreadId(conversations)).toBe(threadA);
		expect(
			decideThreadForUrl({ threadId: undefined, conversations }),
		).toEqual({
			type: "switch",
			threadId: threadA,
			replaceUrl: true,
		});
		expect(
			decideThreadForUrl({ threadId: missingThread, conversations }),
		).toEqual({
			type: "switch",
			threadId: threadA,
			replaceUrl: true,
		});
	});

	it("requests a new conversation when no regular fallback exists", () => {
		expect(
			decideThreadForUrl({
				threadId: missingThread,
				conversations: [makeConversation(threadB, "archived")],
			}),
		).toEqual({ type: "create" });
	});
});
