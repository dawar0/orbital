import { Badge } from "#/components/ui/badge";
import type { DocumentStatus } from "../types";
import { getDocumentStatusMeta } from "../utils";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
	const statusMeta = getDocumentStatusMeta(status);
	const StatusIcon = statusMeta.icon;

	return (
		<Badge variant={statusMeta.variant} className={statusMeta.className}>
			<StatusIcon className={statusMeta.iconClassName} />
			{statusMeta.label}
		</Badge>
	);
}
