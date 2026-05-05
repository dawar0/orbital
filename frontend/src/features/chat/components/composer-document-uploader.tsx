"use client";

import {
	FileTextIcon,
	PaperclipIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import {
	type ChangeEvent,
	type FC,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { TooltipIconButton } from "#/components/assistant-ui/tooltip-icon-button";
import { Badge } from "#/components/ui/badge";
import { Spinner } from "#/components/ui/spinner";
import { useChat } from "#/features/chat/context";
import { getDefaultTitle } from "#/features/documents/utils";
import { api } from "#/lib/api";

type InFlightUpload = {
	tempId: string;
	title: string;
	status: "uploading" | "processing" | "error";
	documentId?: string;
};

let tempIdCounter = 0;
const nextTempId = () => `composer-upload-${++tempIdCounter}`;

export const ComposerDocumentUploader: FC = () => {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [uploads, setUploads] = useState<InFlightUpload[]>([]);
	const { addActiveDocument, readyDocuments } = useChat();
	const uploadDocumentMutation = api.documents.uploadDocument.useMutation();

	useEffect(() => {
		if (uploads.length === 0) return;

		const readyById = new Map(
			readyDocuments.map((document) => [document.id, document]),
		);
		const promoted: string[] = [];

		setUploads((current) => {
			const next = current.filter((upload) => {
				if (
					upload.status === "processing" &&
					upload.documentId &&
					readyById.has(upload.documentId)
				) {
					promoted.push(upload.documentId);
					return false;
				}
				return true;
			});
			return next.length === current.length ? current : next;
		});

		for (const documentId of promoted) {
			addActiveDocument(documentId);
		}
	}, [readyDocuments, uploads, addActiveDocument]);

	const handlePick = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) return;

			const tempId = nextTempId();
			const title = getDefaultTitle(file.name);
			setUploads((current) => [
				...current,
				{ tempId, title, status: "uploading" },
			]);

			const formData = new FormData();
			formData.append("file", file);
			formData.append("title", title);

			uploadDocumentMutation.mutate(
				{ body: formData },
				{
					onSuccess: (data) => {
						setUploads((current) =>
							current.map((upload) =>
								upload.tempId === tempId
									? {
											...upload,
											status: "processing",
											documentId: data.id,
										}
									: upload,
							),
						);
						void api.documents.listDocuments.invalidateQueries();
					},
					onError: () => {
						setUploads((current) =>
							current.map((upload) =>
								upload.tempId === tempId
									? { ...upload, status: "error" }
									: upload,
							),
						);
						toast.error("Couldn't upload document", {
							description:
								"Try again in a moment. If it keeps happening, refresh the page and try once more.",
						});
					},
				},
			);
		},
		[uploadDocumentMutation],
	);

	const dismissUpload = useCallback((tempId: string) => {
		setUploads((current) =>
			current.filter((upload) => upload.tempId !== tempId),
		);
	}, []);

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept="application/pdf"
				className="hidden"
				onChange={handlePick}
			/>
			<TooltipIconButton
				tooltip="Upload document"
				side="bottom"
				type="button"
				variant="ghost"
				size="icon"
				className="size-8 rounded-full p-1 text-muted-foreground hover:bg-muted-foreground/15"
				aria-label="Upload document"
				onClick={() => inputRef.current?.click()}
			>
				<PaperclipIcon className="size-4" />
			</TooltipIconButton>
			{uploads.length > 0 ? (
				<div className="flex flex-wrap gap-1 px-1">
					{uploads.map((upload) => (
						<Badge
							key={upload.tempId}
							variant={upload.status === "error" ? "destructive" : "outline"}
							className="h-6 max-w-56 gap-1 rounded-full pr-1"
						>
							{upload.status === "error" ? (
								<TriangleAlertIcon className="size-3" />
							) : upload.status === "processing" ? (
								<Spinner className="size-3" />
							) : (
								<FileTextIcon className="size-3 text-muted-foreground" />
							)}
							<span className="truncate">
								{upload.status === "uploading"
									? `Uploading ${upload.title}…`
									: upload.status === "processing"
										? `Processing ${upload.title}…`
										: `Failed: ${upload.title}`}
							</span>
							<button
								type="button"
								className="rounded-full p-0.5 hover:bg-muted"
								onClick={() => dismissUpload(upload.tempId)}
								aria-label={`Dismiss ${upload.title}`}
							>
								<XIcon className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			) : null}
		</>
	);
};
