import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { DocumentListItem } from "../types";
import {
	documentTableColumns,
	formatBytes,
	formatDate,
	truncateText,
} from "../utils";
import { DocumentActionsMenu } from "./document-actions-menu";
import { DocumentStatusBadge } from "./document-status-badge";

export function DocumentsTable({
	documents,
}: {
	documents: DocumentListItem[];
}) {
	return (
		<div className="rounded-xl border">
			<Table>
				<TableHeader>
					<TableRow>
						{documentTableColumns.map((column) => (
							<TableHead
								key={column}
								className={
									column === "Actions" ? "w-[1%] text-right" : undefined
								}
							>
								{column}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{documents.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={documentTableColumns.length}
								className="py-12 text-center text-sm text-muted-foreground"
							>
								No documents yet.
							</TableCell>
						</TableRow>
					) : (
						documents.map((document) => (
							<TableRow key={document.id}>
								<TableCell className="font-medium" title={document.title}>
									{truncateText(document.title, 25)}
								</TableCell>
								<TableCell
									className="text-muted-foreground"
									title={document.original_filename}
								>
									{truncateText(document.original_filename, 25)}
								</TableCell>
								<TableCell>
									<DocumentStatusBadge status={document.status} />
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatBytes(document.size_bytes)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatDate(document.uploaded_at)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatDate(document.indexed_at)}
								</TableCell>
								<TableCell className="w-[1%] text-right">
									<DocumentActionsMenu document={document} />
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
