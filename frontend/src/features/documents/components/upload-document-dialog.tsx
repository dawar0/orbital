import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { api } from "#/lib/api";
import { getDefaultTitle } from "../utils";

export function UploadDocumentDialog() {
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [title, setTitle] = useState("");

	const uploadDocumentMutation = api.documents.uploadDocument.useMutation(
		undefined,
		{
			onSuccess: async () => {
				await api.documents.listDocuments.invalidateQueries();
				setFile(null);
				setTitle("");
				setOpen(false);
			},
			onError: () => {
				toast.error("Couldn't upload document", {
					description:
						"Try again in a moment. If it keeps happening, refresh the page and try once more.",
				});
			},
		},
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!uploadDocumentMutation.isPending && !nextOpen) {
			setFile(null);
			setTitle("");
			uploadDocumentMutation.reset();
		}

		setOpen(nextOpen);
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] ?? null;
		setFile(nextFile);
		setTitle(nextFile ? getDefaultTitle(nextFile.name) : "");
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!file || !title.trim()) {
			return;
		}

		const formData = new FormData();
		formData.append("file", file);
		formData.append("title", title.trim());

		uploadDocumentMutation.mutate({
			body: formData,
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button>Upload Document</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Upload document</DialogTitle>
					<DialogDescription>
						Add a file and title to create a new document in the library.
					</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="document-file">File</Label>
						<Input
							id="document-file"
							type="file"
							onChange={handleFileChange}
							disabled={uploadDocumentMutation.isPending}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="document-title">Title</Label>
						<Input
							id="document-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Quarterly Report Summary"
							disabled={uploadDocumentMutation.isPending}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button
								type="button"
								variant="outline"
								disabled={uploadDocumentMutation.isPending}
							>
								Cancel
							</Button>
						</DialogClose>
						<Button
							type="submit"
							disabled={
								uploadDocumentMutation.isPending || !file || !title.trim()
							}
						>
							{uploadDocumentMutation.isPending
								? "Uploading..."
								: "Upload Document"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
