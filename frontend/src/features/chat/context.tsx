import { createContext, useContext } from "react";
import type { AssistantCitation } from "#/components/assistant-ui/citations";
import type { DocumentListItem } from "#/features/documents/types";
import type { ConversationListItem } from "./types";

export type { ConversationListItem } from "./types";

export type CitationSelection = {
	citation: AssistantCitation;
	index: number;
};

export type DocumentSelection = {
	documentId: string;
	title?: string | null;
	chunkId?: string;
	pageNumber?: number | null;
	snippet?: string | null;
};

export type ViewerSelection =
	| ({ type: "citation" } & CitationSelection)
	| ({ type: "document" } & DocumentSelection);

export type ChatContextValue = {
	activeConversationId: string | undefined;
	conversations: ConversationListItem[];
	isConversationsLoading: boolean;
	activeDocumentIds: string[];
	activeDocuments: DocumentListItem[];
	readyDocuments: DocumentListItem[];
	selectedViewerItem: ViewerSelection | null;
	setSelectedViewerItem: (selection: ViewerSelection | null) => void;
	selectedCitation: CitationSelection | null;
	setSelectedCitation: (selection: CitationSelection | null) => void;
	addActiveDocument: (documentId: string) => void;
	removeActiveDocument: (documentId: string) => void;
	createConversation: (options?: {
		activeDocumentIds?: string[];
	}) => Promise<string>;
	switchConversation: (conversationId: string) => Promise<string>;
	archiveConversation: (conversationId: string) => Promise<void>;
	deleteConversation: (conversationId: string) => Promise<void>;
	startChatWithDocument: (documentId: string) => Promise<string>;
};

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
	const value = useContext(ChatContext);
	if (!value) {
		throw new Error("useChat must be used inside ChatRuntimeProvider");
	}
	return value;
}
