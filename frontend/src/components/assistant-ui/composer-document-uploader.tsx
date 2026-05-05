import { PaperclipIcon, XIcon } from "lucide-react";
import {
	type ChangeEvent,
	createContext,
	type FC,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { useChat } from "#/features/chat/context";
import { getDefaultTitle } from "#/features/documents/utils";
import { api } from "#/lib/api";

type PendingUpload = {
	tempId: string;
	filename: string;
	title: string;
	status: "uploading" | "processing" | "error";
	documentId?: string;
};

type ComposerUploadContextValue = {
	openFilePicker: () => void;
	pendingUploads: PendingUpload[];
	dismissUpload: (tempId: string) => void;
	retryUpload: () => void;
};

const ComposerUploadContext = createContext<ComposerUploadContextValue | null>(
	null,
);

function useComposerUpload() {
	const value = useContext(ComposerUploadContext);
	if (!value) {
		throw new Error(
			"useComposerUpload must be used inside ComposerUploadProvider",
		);
	}
	return value;
}

let tempIdCounter = 0;

export function ComposerUploadProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
	const { addActiveDocument, readyDocuments } = useChat();

	const uploadMutation = api.documents.uploadDocument.useMutation(undefined, {
		onSuccess: async (data) => {
			await api.documents.listDocuments.invalidateQueries();
			setPendingUploads((current) => {
				const uploading = current.find(
					(entry) => entry.status === "uploading" && !entry.documentId,
				);
				if (!uploading) return current;
				return current.map((entry) =>
					entry.tempId === uploading.tempId
						? {
								...entry,
								status: "processing" as const,
								documentId: data.id,
							}
						: entry,
				);
			});
		},
		onError: () => {
			setPendingUploads((current) => {
				const uploading = current.find(
					(entry) => entry.status === "uploading" && !entry.documentId,
				);
				if (!uploading) return current;
				return current.map((entry) =>
					entry.tempId === uploading.tempId
						? { ...entry, status: "error" as const }
						: entry,
				);
			});
		},
	});

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;

			const title = getDefaultTitle(file.name);
			const tempId = `temp-${Date.now()}-${++tempIdCounter}`;

			setPendingUploads((current) => [
				...current,
				{ tempId, filename: file.name, title, status: "uploading" },
			]);

			const formData = new FormData();
			formData.append("file", file);
			formData.append("title", title);

			uploadMutation.mutate({ body: formData });

			event.target.value = "";
		},
		[uploadMutation],
	);

	const dismissUpload = useCallback((tempId: string) => {
		setPendingUploads((current) => current.filter((e) => e.tempId !== tempId));
	}, []);

	const openFilePicker = useCallback(() => {
		inputRef.current?.click();
	}, []);

	useEffect(() => {
		if (pendingUploads.length === 0) return;

		const readyIds = new Set(readyDocuments.map((d) => d.id));

		const promoted = pendingUploads.filter(
			(entry) =>
				entry.status === "processing" &&
				entry.documentId &&
				readyIds.has(entry.documentId),
		);

		if (promoted.length === 0) return;

		for (const entry of promoted) {
			if (entry.documentId) {
				addActiveDocument(entry.documentId);
			}
		}

		const promotedTempIds = new Set(promoted.map((e) => e.tempId));
		setPendingUploads((current) =>
			current.filter((e) => !promotedTempIds.has(e.tempId)),
		);
	}, [readyDocuments, pendingUploads, addActiveDocument]);

	const value = useMemo(
		() => ({
			openFilePicker,
			pendingUploads,
			dismissUpload,
			retryUpload: openFilePicker,
		}),
		[openFilePicker, pendingUploads, dismissUpload],
	);

	return (
		<ComposerUploadContext.Provider value={value}>
			<input
				ref={inputRef}
				type="file"
				accept="application/pdf"
				className="hidden"
				onChange={handleFileChange}
			/>
			{children}
		</ComposerUploadContext.Provider>
	);
}

export const ComposerUploadChips: FC = () => {
	const { pendingUploads, dismissUpload, retryUpload } = useComposerUpload();

	if (pendingUploads.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1 px-1">
			{pendingUploads.map((entry) => (
				<PendingUploadChip
					key={entry.tempId}
					entry={entry}
					onDismiss={dismissUpload}
					onRetry={retryUpload}
				/>
			))}
		</div>
	);
};

export const ComposerUploadButton: FC = () => {
	const { openFilePicker } = useComposerUpload();

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="size-8 shrink-0 rounded-full"
			onClick={openFilePicker}
			aria-label="Upload a document"
		>
			<PaperclipIcon className="size-4" />
		</Button>
	);
};

const PendingUploadChip: FC<{
	entry: PendingUpload;
	onDismiss: (tempId: string) => void;
	onRetry: () => void;
}> = ({ entry, onDismiss, onRetry }) => {
	return (
		<Badge
			variant={entry.status === "error" ? "destructive" : "outline"}
			className="h-6 max-w-56 gap-1 rounded-full pr-1"
		>
			{entry.status === "uploading" || entry.status === "processing" ? (
				<Spinner className="size-3" />
			) : null}
			<span className="truncate">
				{entry.status === "uploading"
					? "Uploading..."
					: entry.status === "processing"
						? "Processing..."
						: "Upload failed"}
			</span>
			{entry.status === "error" ? (
				<button
					type="button"
					className="rounded-full p-0.5 hover:bg-muted"
					onClick={onRetry}
					aria-label={`Retry ${entry.title}`}
				>
					<PaperclipIcon className="size-3" />
				</button>
			) : null}
			<button
				type="button"
				className="rounded-full p-0.5 hover:bg-muted"
				onClick={() => onDismiss(entry.tempId)}
				aria-label={`Dismiss ${entry.title}`}
			>
				<XIcon className="size-3" />
			</button>
		</Badge>
	);
};
