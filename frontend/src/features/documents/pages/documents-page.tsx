import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { api } from "#/lib/api";
import { DocumentsTable } from "../components/documents-table";
import { DocumentsTableSkeleton } from "../components/documents-table-skeleton";
import { UploadDocumentDialog } from "../components/upload-document-dialog";
import { isDocumentProcessing } from "../utils";

export function DocumentsPage() {
	const { data, error, isPending, isRefetchError, refetch } =
		api.documents.listDocuments.useQuery(undefined, {
			refetchInterval: (query) => {
				const documents = query.state.data?.items ?? [];

				return documents.some((document) =>
					isDocumentProcessing(document.status),
				)
					? 5000
					: false;
			},
		});
	const documents = data?.items ?? [];
	const hasLoadedDocuments = data !== undefined;
	const showBlockingError = !hasLoadedDocuments && error;
	const showBackgroundError = hasLoadedDocuments && isRefetchError;

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
			<div className="space-y-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-2">
						<h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
						<p className="text-sm text-muted-foreground">
							Browse, upload, download, and manage your documents in one place.
						</p>
					</div>
					<UploadDocumentDialog />
				</div>
				{showBackgroundError ? (
					<Alert>
						<AlertTitle>Couldn&apos;t refresh documents</AlertTitle>
						<AlertDescription>
							Showing the most recent saved results. Try refreshing again in a
							moment.
						</AlertDescription>
						<AlertAction>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void refetch()}
							>
								Refresh
							</Button>
						</AlertAction>
					</Alert>
				) : null}
				{showBlockingError ? (
					<Alert variant="destructive">
						<AlertTitle>Couldn&apos;t load documents</AlertTitle>
						<AlertDescription>
							Try again in a moment. If it keeps happening, refresh the page and
							try once more.
						</AlertDescription>
						<AlertAction>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void refetch()}
							>
								Retry
							</Button>
						</AlertAction>
					</Alert>
				) : isPending ? (
					<DocumentsTableSkeleton />
				) : (
					<DocumentsTable documents={documents} />
				)}
			</div>
		</div>
	);
}
