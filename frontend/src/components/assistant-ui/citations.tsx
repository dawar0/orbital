"use client";

import { useAuiState } from "@assistant-ui/react";
import { createContext, type ReactNode, useContext } from "react";

import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "#/components/ui/hover-card";
import { cn } from "#/lib/utils";

export type AssistantCitation = {
	chunk_id?: string;
	document_id?: string;
	document_title?: string;
	page_number?: number;
	snippet?: string;
};

export const EMPTY_CITATIONS: AssistantCitation[] = [];
export const CITATION_LINK_PREFIX = "citation://";

export const ThreadCitationsContext = createContext<
	Record<string, AssistantCitation[]>
>({});

export function extractCitations(value: unknown) {
	if (!value || typeof value !== "object") {
		return EMPTY_CITATIONS;
	}

	const citations = (value as { citations?: unknown }).citations;

	if (!Array.isArray(citations)) {
		return EMPTY_CITATIONS;
	}

	return citations.filter(
		(citation): citation is AssistantCitation =>
			typeof citation === "object" && citation !== null,
	);
}

export function areCitationsEqual(
	left: AssistantCitation[] | undefined,
	right: AssistantCitation[],
) {
	if (!left) {
		return false;
	}

	return JSON.stringify(left) === JSON.stringify(right);
}

export function formatPageSummary(pageNumbers: number[]) {
	if (pageNumbers.length === 0) {
		return "Page numbers unavailable";
	}

	if (pageNumbers.length === 1) {
		return `Page ${pageNumbers[0]}`;
	}

	const leadingPages = pageNumbers.slice(0, -1).join(", ");
	const trailingPage = pageNumbers.at(-1);

	return `Pages ${leadingPages} and ${trailingPage}`;
}

export function getCitationTitle(citation: AssistantCitation) {
	return citation.document_title || "Document";
}

export function getCitationPageSummary(citation: AssistantCitation) {
	return citation.page_number != null
		? formatPageSummary([citation.page_number])
		: "Page numbers unavailable";
}

export function getCitationKey(citation: AssistantCitation, index: number) {
	return [
		citation.chunk_id,
		citation.document_id,
		citation.page_number,
		index,
	].join(":");
}

export function getCitationHref(index: number) {
	return `${CITATION_LINK_PREFIX}${index + 1}`;
}

export function getCitationIndexFromHref(href?: string | null) {
	if (!href?.startsWith("citation:")) {
		return null;
	}

	const match = href.match(/^citation:(?:\/\/)?(\d+)\/?$/);

	if (!match) {
		return null;
	}

	const rawIndex = Number(match[1]);

	if (!Number.isInteger(rawIndex) || rawIndex < 1) {
		return null;
	}

	return rawIndex - 1;
}

export function CitationPopover({
	citation,
	children,
	className,
	onClick,
	variant = "chip",
}: {
	citation: AssistantCitation;
	children: ReactNode;
	className?: string;
	onClick?: () => void;
	variant?: "chip" | "inline";
}) {
	return (
		<HoverCard openDelay={120}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onClick={onClick}
					className={cn(
						variant === "inline"
							? "inline-flex cursor-pointer items-center rounded-sm px-0.5 py-0 font-medium text-[0.75em] text-muted-foreground no-underline transition-colors hover:text-foreground"
							: "inline-flex cursor-pointer items-center gap-1 rounded-full border bg-muted/40 text-left text-foreground transition-colors hover:bg-muted/70",
						className,
					)}
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-80 gap-2 rounded-2xl border bg-popover/95 p-3 backdrop-blur-sm"
			>
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-0.5">
						<div className="font-medium text-sm text-foreground">
							{getCitationTitle(citation)}
						</div>
						<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
							{getCitationPageSummary(citation)}
						</div>
					</div>
					{citation.snippet ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							...{citation.snippet}
						</p>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

export function useMessageCitations() {
	const messageId = useAuiState((s) => s.message.id);
	const messageCustomMetadata = useAuiState((s) => s.message.metadata.custom);
	const messageState = useAuiState((s) => s.message.metadata.unstable_state);
	const citationsByMessageId = useContext(ThreadCitationsContext);
	const metadataCitations = extractCitations(messageCustomMetadata);
	const stateCitations = extractCitations(messageState);

	return metadataCitations.length > 0
		? metadataCitations
		: stateCitations.length > 0
			? stateCitations
			: (citationsByMessageId[messageId] ?? EMPTY_CITATIONS);
}
