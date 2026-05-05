import { describe, expect, it } from "vitest";
import { normalizeConversationHistoryMessages } from "./history-messages";

describe("normalizeConversationHistoryMessages", () => {
	it("converts legacy assistant string content to a renderable text part", () => {
		const items = normalizeConversationHistoryMessages([
			{
				parent_id: "user-1",
				message_id: "assistant-1",
				created_at: "2026-05-04T10:00:00.000Z",
				message: {
					role: "assistant",
					content: "Here is the answer.",
				},
			},
		]);

		const item = items[0];
		expect(item).toBeDefined();
		if (!item) {
			throw new Error("expected normalized history item");
		}

		expect(item.parentId).toBe("user-1");
		expect(item.message).toMatchObject({
			id: "assistant-1",
			role: "assistant",
			content: [{ type: "text", text: "Here is the answer." }],
			status: { type: "complete", reason: "stop" },
			metadata: {
				unstable_state: null,
				unstable_annotations: [],
				unstable_data: [],
				steps: [],
				custom: {},
			},
		});
		expect(item.message.createdAt).toBeInstanceOf(Date);
	});

	it("restores current assistant messages with ISO createdAt values", () => {
		const items = normalizeConversationHistoryMessages([
			{
				parent_id: null,
				message_id: "fallback-id",
				created_at: "2026-05-04T09:00:00.000Z",
				message: {
					id: "assistant-current",
					role: "assistant",
					createdAt: "2026-05-04T10:30:00.000Z",
					content: [{ type: "text", text: "Already normalized." }],
					status: { type: "complete", reason: "unknown" },
					metadata: {
						unstable_state: { citations: [] },
						unstable_annotations: [{ kind: "annotation" }],
						unstable_data: [{ kind: "data" }],
						steps: [{ messageId: "assistant-current" }],
						custom: { source: "stored" },
					},
				},
			},
		]);

		const item = items[0];
		expect(item).toBeDefined();
		if (!item) {
			throw new Error("expected normalized history item");
		}

		expect(item.message.id).toBe("assistant-current");
		expect(item.message.createdAt).toEqual(
			new Date("2026-05-04T10:30:00.000Z"),
		);
		expect(item.message).toMatchObject({
			role: "assistant",
			status: { type: "complete", reason: "unknown" },
			metadata: {
				unstable_state: { citations: [] },
				unstable_annotations: [{ kind: "annotation" }],
				unstable_data: [{ kind: "data" }],
				steps: [{ messageId: "assistant-current" }],
				custom: { source: "stored" },
			},
		});
	});

	it("adds required user attachments and metadata defaults", () => {
		const items = normalizeConversationHistoryMessages([
			{
				message_id: "user-1",
				created_at: "2026-05-04T10:00:00.000Z",
				message: {
					role: "user",
					content: "What happened?",
				},
				run_config: { custom: { activeDocumentIds: ["doc-1"] } },
			},
		]);

		const item = items[0];
		expect(item).toBeDefined();
		if (!item) {
			throw new Error("expected normalized history item");
		}

		expect(item.runConfig).toEqual({
			custom: { activeDocumentIds: ["doc-1"] },
		});
		expect(item.message).toMatchObject({
			id: "user-1",
			role: "user",
			content: [{ type: "text", text: "What happened?" }],
			attachments: [],
			metadata: { custom: {} },
		});
	});

	it("restores assistant state snapshots from message rows", () => {
		const items = normalizeConversationHistoryMessages([
			{
				message_id: "assistant-with-state",
				message: {
					role: "assistant",
					content: "See source [1].",
				},
				state_snapshot: {
					citations: [
						{
							source_id: 1,
							document_id: "doc-1",
							document_title: "Doc",
							chunk_id: "chunk-1",
						},
					],
				},
			},
		]);

		expect(items[0]?.message.metadata).toMatchObject({
			unstable_state: {
				citations: [
					{
						source_id: 1,
						document_id: "doc-1",
						document_title: "Doc",
						chunk_id: "chunk-1",
					},
				],
			},
		});
	});

	it("filters malformed history rows without throwing", () => {
		const items = normalizeConversationHistoryMessages([
			{
				message_id: "missing-role",
				message: {
					content: "No role",
				},
			},
			{
				message_id: "missing-content",
				message: {
					role: "assistant",
				},
			},
			{
				message: {
					role: "assistant",
					content: "No id fallback",
				},
			},
			{
				message_id: "valid",
				message: {
					role: "assistant",
					content: "Still works",
				},
			},
		]);

		expect(items).toHaveLength(1);
		expect(items[0]?.message.id).toBe("valid");
	});
});
