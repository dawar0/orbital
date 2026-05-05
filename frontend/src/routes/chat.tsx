import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChatPage } from "#/features/chat/pages/chat-page";
import { useChat } from "#/features/chat/context";
import {
	CHAT_PATH,
	decideThreadForUrl,
	validateChatSearch,
} from "#/features/chat/thread-url";

export const Route = createFileRoute("/chat")({
	validateSearch: validateChatSearch,
	component: ChatRoute,
});

function ChatRoute() {
	const { threadId } = Route.useSearch();

	return (
		<>
			<ChatThreadUrlSync threadId={threadId} />
			<ChatPage />
		</>
	);
}

function ChatThreadUrlSync({ threadId }: { threadId: string | undefined }) {
	const navigate = useNavigate();
	const {
		conversations,
		isConversationsLoading,
		createConversation,
		switchConversation,
	} = useChat();

	useEffect(() => {
		if (isConversationsLoading) {
			return;
		}

		let cancelled = false;

		const syncThread = async () => {
			const decision = decideThreadForUrl({ threadId, conversations });

			if (decision.type === "create") {
				const conversationId = await createConversation();
				if (!cancelled) {
					await navigate({
						to: CHAT_PATH,
						search: { threadId: conversationId },
						replace: true,
					});
				}
				return;
			}

			await switchConversation(decision.threadId);

			if (!cancelled && decision.replaceUrl) {
				await navigate({
					to: CHAT_PATH,
					search: { threadId: decision.threadId },
					replace: true,
				});
			}
		};

		void syncThread().catch(() => {
			if (!cancelled) {
				void createConversation()
					.then((conversationId) =>
						navigate({
							to: CHAT_PATH,
							search: { threadId: conversationId },
							replace: true,
						}),
					)
					.catch(() => {});
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		conversations,
		createConversation,
		isConversationsLoading,
		navigate,
		switchConversation,
		threadId,
	]);

	return null;
}
