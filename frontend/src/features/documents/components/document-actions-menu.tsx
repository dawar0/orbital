import { Download, LoaderCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { api } from "#/lib/api";
import type { DocumentListItem } from "../types";

function startDownload(url: string, fileName: string) {
	const link = globalThis.document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener noreferrer";
	link.target = "_blank";
	globalThis.document.body.append(link);
	link.click();
	link.remove();
}

export function DocumentActionsMenu({
	document: documentItem,
}: {
	document: DocumentListItem;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const isDownloading =
		api.documents.getDocument.useIsFetching({
			parameters: {
				path: {
					document_id: documentItem.id,
				},
			},
		}) > 0;

	const deleteDocumentMutation = api.documents.deleteDocument.useMutation(
		{
			path: {
				document_id: documentItem.id,
			},
		},
		{
			onSuccess: async () => {
				await api.documents.listDocuments.invalidateQueries();
				setDeleteDialogOpen(false);
			},
			onError: () => {
				toast.error("Couldn't delete document", {
					description:
						"Try again in a moment. If it keeps happening, refresh the page and try once more.",
				});
			},
		},
	);

	const isDeleted = documentItem.status === "deleted";
	const isBusy = isDownloading || deleteDocumentMutation.isPending;

	const handleDeleteDialogOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && !deleteDocumentMutation.isPending) {
			deleteDocumentMutation.reset();
		}

		setDeleteDialogOpen(nextOpen);
	};

	const handleDownload = async () => {
		try {
			const documentDetail = await api.documents.getDocument.fetchQuery({
				parameters: {
					path: {
						document_id: documentItem.id,
					},
				},
			});

			if (!documentDetail.download_url) {
				throw new Error("Missing download URL");
			}

			startDownload(
				documentDetail.download_url,
				documentDetail.original_filename,
			);
			setMenuOpen(false);
		} catch {
			toast.error("Couldn't download document", {
				description: "Try again in a moment.",
			});
		}
	};

	const handleDelete = () => {
		deleteDocumentMutation.mutate();
	};

	return (
		<>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="rounded-full"
						aria-label={`Open actions for ${documentItem.title}`}
						disabled={deleteDocumentMutation.isPending}
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						disabled={isBusy || isDeleted}
						onSelect={(event) => {
							event.preventDefault();
							void handleDownload();
						}}
					>
						{isDownloading ? (
							<LoaderCircle className="animate-spin" />
						) : (
							<Download />
						)}
						{isDownloading ? "Downloading..." : "Download"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						className="bg-destructive/5 text-destructive hover:bg-destructive/10 focus:bg-destructive/10 dark:bg-destructive/10 dark:hover:bg-destructive/20 dark:focus:bg-destructive/20"
						disabled={isBusy || isDeleted}
						onSelect={(event) => {
							event.preventDefault();
							setMenuOpen(false);
							setDeleteDialogOpen(true);
						}}
					>
						<Trash2 />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog
				open={deleteDialogOpen}
				onOpenChange={handleDeleteDialogOpenChange}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete document?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove <strong>{documentItem.title}</strong> from the
							library. You can&apos;t undo this action.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteDocumentMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteDocumentMutation.isPending}
							onClick={(event) => {
								event.preventDefault();
								void handleDelete();
							}}
						>
							{deleteDocumentMutation.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
