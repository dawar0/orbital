import { useAui, type LanguageModelConfig } from "@assistant-ui/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

type ActiveDocumentModelConfig = LanguageModelConfig & {
	active_document_context: {
		active_document_ids: string[];
	};
};

export function ActiveDocumentModelContext({
	activeDocumentIds,
}: {
	activeDocumentIds: string[];
}) {
	const aui = useAui();
	const activeDocumentIdsRef = useRef(activeDocumentIds);

	useLayoutEffect(() => {
		activeDocumentIdsRef.current = activeDocumentIds;
		const activeDocumentContext = {
			active_document_ids: activeDocumentIds,
		};
		const currentRunConfig = aui.composer().getState().runConfig;
		aui.composer().setRunConfig({
			...currentRunConfig,
			custom: {
				...currentRunConfig.custom,
				active_document_context: activeDocumentContext,
			},
		});
	}, [aui, activeDocumentIds]);

	const provider = useMemo(
		() => ({
			getModelContext: () => ({
				config: {
					active_document_context: {
						active_document_ids: activeDocumentIdsRef.current,
					},
				} satisfies ActiveDocumentModelConfig,
			}),
		}),
		[],
	);

	useEffect(() => {
		return aui.modelContext().register(provider);
	}, [aui, provider]);

	return null;
}
