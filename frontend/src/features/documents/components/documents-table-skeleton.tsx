import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { documentTableColumns, skeletonRowIds } from "../utils";

export function DocumentsTableSkeleton() {
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
					{skeletonRowIds.map((rowId) => (
						<TableRow key={rowId}>
							<TableCell>
								<Skeleton className="h-4 w-40 rounded-md" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-48 rounded-md" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-5 w-20 rounded-full" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-16 rounded-md" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-32 rounded-md" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-32 rounded-md" />
							</TableCell>
							<TableCell className="w-[1%]">
								<div className="flex justify-end">
									<Skeleton className="size-8 rounded-full" />
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
