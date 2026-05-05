import { useMemo } from "react";
import { isDocumentProcessing } from "#/features/documents/utils";
import { api } from "#/lib/api";

export function useChatDocuments(activeDocumentIds: string[]) {
	const { data: documentsData } = api.documents.listDocuments.useQuery(
		undefined,
		{
			refetchInterval: (query) => {
				const documents = query.state.data?.items ?? [];
				return documents.some((document) =>
					isDocumentProcessing(document.status),
				)
					? 5000
					: false;
			},
		},
	);

	const documents = documentsData?.items ?? [];
	const readyDocuments = useMemo(
		() => documents.filter((document) => document.status === "ready"),
		[documents],
	);
	const activeDocuments = useMemo(
		() =>
			activeDocumentIds
				.map((documentId) =>
					documents.find((document) => document.id === documentId),
				)
				.filter((document): document is NonNullable<typeof document> =>
					Boolean(document),
				),
		[activeDocumentIds, documents],
	);

	return {
		activeDocuments,
		readyDocuments,
	};
}
