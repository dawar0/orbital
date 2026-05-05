import type { ThreadMessage } from "@assistant-ui/react";

type MessageRole = "assistant" | "user" | "system";

export type PersistedConversationMessage = {
	parent_id?: string | null;
	message_id?: string;
	created_at?: string;
	message: Record<string, unknown>;
	run_config?: Record<string, unknown> | null;
	state_snapshot?: Record<string, unknown> | null;
};

export type ConversationHistoryItem = {
	parentId: string | null;
	message: ThreadMessage;
	runConfig?: Record<string, unknown>;
};

const assistantCompleteStatus = {
	type: "complete",
	reason: "stop",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function getRole(value: unknown): MessageRole | null {
	return value === "assistant" || value === "user" || value === "system"
		? value
		: null;
}

function getDate(value: unknown, fallback: unknown): Date {
	const date = parseDate(value) ?? parseDate(fallback);
	return date ?? new Date(0);
}

function parseDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}
	if (typeof value !== "string" && typeof value !== "number") {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTextPart(part: Record<string, unknown>) {
	const text = part.text;
	if (typeof text !== "string") {
		return null;
	}
	return {
		...part,
		type: "text" as const,
		text,
	};
}

function normalizeToolCallPart(part: Record<string, unknown>) {
	const toolName = getString(part, "toolName") ?? getString(part, "name");
	if (!toolName) {
		return null;
	}

	const args = isRecord(part.args) ? part.args : {};
	const argsText =
		typeof part.argsText === "string" ? part.argsText : JSON.stringify(args);

	return {
		...part,
		type: "tool-call" as const,
		toolCallId:
			getString(part, "toolCallId") ?? getString(part, "tool_call_id") ?? "",
		toolName,
		args,
		argsText,
	};
}

function normalizeContentPart(part: unknown) {
	if (!isRecord(part)) {
		return null;
	}

	switch (part.type) {
		case "text":
		case "reasoning":
			return normalizeTextPart(part);
		case "tool-call":
			return normalizeToolCallPart(part);
		case "source":
		case "file":
		case "image":
		case "data":
		case "audio":
			return part;
		default:
			return null;
	}
}

function normalizeContent(content: unknown) {
	if (typeof content === "string") {
		return [{ type: "text" as const, text: content }];
	}
	if (!Array.isArray(content)) {
		return null;
	}

	return content
		.map((part) => normalizeContentPart(part))
		.filter((part): part is NonNullable<typeof part> => part !== null);
}

function normalizeMetadata(
	role: MessageRole,
	metadata: unknown,
	stateSnapshot: unknown,
) {
	const source = isRecord(metadata) ? metadata : {};
	const custom = isRecord(source.custom) ? source.custom : {};

	if (role !== "assistant") {
		return { custom };
	}

	return {
		unstable_state:
			source.unstable_state === undefined
				? (isRecord(stateSnapshot) ? stateSnapshot : null)
				: source.unstable_state,
		unstable_annotations: Array.isArray(source.unstable_annotations)
			? source.unstable_annotations
			: [],
		unstable_data: Array.isArray(source.unstable_data)
			? source.unstable_data
			: [],
		steps: Array.isArray(source.steps) ? source.steps : [],
		...(isRecord(source.timing) ? { timing: source.timing } : {}),
		...(isRecord(source.submittedFeedback)
			? { submittedFeedback: source.submittedFeedback }
			: {}),
		custom,
	};
}

function normalizeStatus(status: unknown) {
	if (!isRecord(status) || typeof status.type !== "string") {
		return assistantCompleteStatus;
	}

	if (
		status.type !== "running" &&
		status.type !== "complete" &&
		status.type !== "incomplete" &&
		status.type !== "requires-action"
	) {
		return assistantCompleteStatus;
	}

	return status;
}

function normalizeMessage(
	row: PersistedConversationMessage,
): ThreadMessage | null {
	const rawMessage = row.message;
	const role = getRole(rawMessage.role);
	if (!role) {
		return null;
	}

	const content = normalizeContent(rawMessage.content);
	if (!content) {
		return null;
	}

	const id = getString(rawMessage, "id") ?? row.message_id;
	if (!id) {
		return null;
	}

	const common = {
		id,
		role,
		createdAt: getDate(rawMessage.createdAt, row.created_at),
		content,
		metadata: normalizeMetadata(role, rawMessage.metadata, row.state_snapshot),
	};

	if (role === "assistant") {
		return {
			...common,
			role,
			status: normalizeStatus(rawMessage.status),
		} as ThreadMessage;
	}

	if (role === "user") {
		return {
			...common,
			role,
			attachments: Array.isArray(rawMessage.attachments)
				? rawMessage.attachments
				: [],
		} as ThreadMessage;
	}

	if (content.length !== 1 || content[0]?.type !== "text") {
		return null;
	}

	return {
		...common,
		role,
		content: [content[0]],
	} as ThreadMessage;
}

export function normalizeConversationHistoryMessages(
	rows: PersistedConversationMessage[] = [],
): ConversationHistoryItem[] {
	return rows.flatMap((row) => {
		const message = normalizeMessage(row);
		if (!message) {
			return [];
		}

		return [
			{
				parentId: row.parent_id ?? null,
				message,
				runConfig: row.run_config ?? undefined,
			},
		];
	});
}
