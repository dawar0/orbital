import type { AssistantRuntime } from "@assistant-ui/react";

export function toAssistantRuntime(runtime: unknown): AssistantRuntime {
	return runtime as AssistantRuntime;
}
