import { Thread } from "#/components/assistant-ui/thread";
import { DocumentViewerPanel } from "../components/document-viewer-panel";

export function ChatPage() {
	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			<Thread />
			<DocumentViewerPanel />
		</div>
	);
}
