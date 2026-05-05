import {
	ChevronDownIcon,
	ChevronUpIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { Spinner } from "#/components/ui/spinner";
import { env } from "#/lib/env";
import { cn } from "#/lib/utils";
import { useChat } from "../context";

type DocumentRead = {
	id: string;
	title: string;
	original_filename: string;
	download_url?: string | null;
	preview_url?: string | null;
};

type SearchResult = {
	chunk_id: string;
	document_id: string;
	page_number?: number | null;
	snippet: string;
};

type SearchResponse = {
	query: string;
	items: SearchResult[];
};

const apiUrl = (path: string) =>
	new URL(path, env.VITE_API_BASE_URL).toString();

async function requestJson<T>(path: string): Promise<T> {
	const response = await fetch(apiUrl(path));
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return (await response.json()) as T;
}

function getPdfSrc(
	downloadUrl: string | null | undefined,
	page?: number | null,
) {
	if (!downloadUrl) {
		return "";
	}

	return page ? `${downloadUrl}#page=${page}` : downloadUrl;
}

function highlightText(value: string, query: string) {
	if (!query.trim()) {
		return value;
	}

	const index = value.toLowerCase().indexOf(query.trim().toLowerCase());
	if (index < 0) {
		return value;
	}

	return (
		<>
			{value.slice(0, index)}
			<mark className="rounded bg-yellow-200 px-0.5 text-yellow-950">
				{value.slice(index, index + query.length)}
			</mark>
			{value.slice(index + query.length)}
		</>
	);
}

export function DocumentViewerPanel() {
	const { selectedViewerItem, setSelectedViewerItem } = useChat();
	const [documentDetail, setDocumentDetail] = useState<DocumentRead | null>(
		null,
	);
	const [isLoadingDocument, setIsLoadingDocument] = useState(false);
	const [documentError, setDocumentError] = useState<string | null>(null);
	const [findOpen, setFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [selectedResultIndex, setSelectedResultIndex] = useState(0);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const panelRef = useRef<HTMLElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const selectedPage =
		results[selectedResultIndex]?.page_number ??
		(selectedViewerItem?.type === "citation"
			? selectedViewerItem.citation.page_number
			: selectedViewerItem?.pageNumber) ??
		null;
	const pdfSrc = getPdfSrc(
		documentDetail?.preview_url ?? documentDetail?.download_url,
		selectedPage,
	);

	const selectedDocumentId =
		selectedViewerItem?.type === "citation"
			? selectedViewerItem.citation.document_id
			: (selectedViewerItem?.documentId ?? null);

	useEffect(() => {
		if (!selectedDocumentId) {
			setDocumentDetail(null);
			return;
		}

		setIsLoadingDocument(true);
		setDocumentError(null);
		setResults([]);
		setFindQuery("");
		setSelectedResultIndex(0);

		void requestJson<DocumentRead>(`/documents/${selectedDocumentId}`)
			.then(setDocumentDetail)
			.catch(() => setDocumentError("Couldn't load this document."))
			.finally(() => setIsLoadingDocument(false));
	}, [selectedDocumentId]);

	useEffect(() => {
		if (!findOpen) {
			return;
		}
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [findOpen]);

	useEffect(() => {
		if (!selectedDocumentId || !findQuery.trim()) {
			setResults([]);
			setSearchError(null);
			return;
		}

		const timeout = window.setTimeout(() => {
			setIsSearching(true);
			setSearchError(null);
			void requestJson<SearchResponse>(
				`/documents/${selectedDocumentId}/search?q=${encodeURIComponent(findQuery)}`,
			)
				.then((response) => {
					setResults(response.items);
					setSelectedResultIndex(0);
				})
				.catch(() => setSearchError("Couldn't search this document."))
				.finally(() => setIsSearching(false));
		}, 250);

		return () => window.clearTimeout(timeout);
	}, [findQuery, selectedDocumentId]);

	const resultSummary = useMemo(() => {
		if (!findQuery.trim()) {
			return "Type to search";
		}
		if (isSearching) {
			return "Searching...";
		}
		if (results.length === 0) {
			return "No results";
		}
		return `${selectedResultIndex + 1} of ${results.length}`;
	}, [findQuery, isSearching, results.length, selectedResultIndex]);

	if (!selectedViewerItem) {
		return null;
	}

	const citation =
		selectedViewerItem.type === "citation"
			? selectedViewerItem.citation
			: null;
	const selectedSearchResult =
		selectedViewerItem.type === "document" && selectedViewerItem.snippet
			? selectedViewerItem
			: null;
	const fallbackTitle =
		selectedViewerItem.type === "document" ? selectedViewerItem.title : null;

	return (
		<aside
			ref={panelRef}
			className="flex h-full w-[44rem] max-w-[46vw] shrink-0 flex-col border-l bg-background"
			onKeyDown={(event) => {
				if (
					(event.metaKey || event.ctrlKey) &&
					event.key.toLowerCase() === "f"
				) {
					event.preventDefault();
					setFindOpen(true);
				}
			}}
		>
			<div className="flex min-h-16 items-center gap-3 border-b px-4">
				<div className="min-w-0 flex-1">
					<h2 className="truncate font-semibold text-sm">
						{documentDetail?.title ??
							citation?.document_title ??
							fallbackTitle ??
							"Document"}
					</h2>
					<p className="text-muted-foreground text-xs">
						{selectedPage ? `Page ${selectedPage}` : "Document preview"}
					</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => setFindOpen((value) => !value)}
					aria-label="Find in document"
				>
					<SearchIcon className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => setSelectedViewerItem(null)}
					aria-label="Close document viewer"
				>
					<XIcon className="size-4" />
				</Button>
			</div>

			{findOpen ? (
				<div className="flex items-center gap-2 border-b p-3">
					<Input
						ref={inputRef}
						value={findQuery}
						onChange={(event) => setFindQuery(event.target.value)}
						placeholder="Find in document"
						className="h-9"
					/>
					<span className="w-20 text-muted-foreground text-xs">
						{resultSummary}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={results.length === 0}
						onClick={() =>
							setSelectedResultIndex((index) =>
								index === 0 ? results.length - 1 : index - 1,
							)
						}
						aria-label="Previous result"
					>
						<ChevronUpIcon className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={results.length === 0}
						onClick={() =>
							setSelectedResultIndex((index) => (index + 1) % results.length)
						}
						aria-label="Next result"
					>
						<ChevronDownIcon className="size-4" />
					</Button>
				</div>
			) : null}

			<div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
				<div className="min-h-0 bg-muted/30">
					{isLoadingDocument ? (
						<div className="flex h-full items-center justify-center">
							<Spinner />
						</div>
					) : documentError ? (
						<div className="p-4">
							<Alert variant="destructive">
								<AlertTitle>Document unavailable</AlertTitle>
								<AlertDescription>{documentError}</AlertDescription>
							</Alert>
						</div>
					) : pdfSrc ? (
						<iframe
							key={pdfSrc}
							src={pdfSrc}
							title={documentDetail?.title ?? "Document preview"}
							className="h-full w-full border-0 bg-background"
						/>
					) : (
						<div className="p-4">
							<Alert>
								<AlertTitle>No preview URL</AlertTitle>
								<AlertDescription>
									This document could not provide a signed PDF URL.
								</AlertDescription>
							</Alert>
						</div>
					)}
				</div>
				<div className="max-h-72 overflow-y-auto border-t bg-background p-3">
					{citation ? (
						<div className="rounded-lg border bg-muted/30 p-3">
							<div className="mb-1 font-medium text-xs">
								Citation [{selectedViewerItem.index + 1}]
							</div>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{citation.snippet ?? "No snippet available."}
							</p>
						</div>
					) : null}
					{selectedSearchResult ? (
						<div className="rounded-lg border bg-muted/30 p-3">
							<div className="mb-1 font-medium text-xs">
								{selectedSearchResult.pageNumber
									? `Search match on page ${selectedSearchResult.pageNumber}`
									: "Search match"}
							</div>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{selectedSearchResult.snippet}
							</p>
						</div>
					) : null}
					{searchError ? (
						<p className="mt-3 text-destructive text-xs">{searchError}</p>
					) : null}
					{results.length > 0 ? (
						<>
							<Separator className="my-3" />
							<div className="space-y-2">
								{results.map((result, index) => (
									<button
										key={result.chunk_id}
										type="button"
										onClick={() => setSelectedResultIndex(index)}
										className={cn(
											"w-full rounded-lg border p-3 text-left text-xs leading-relaxed transition-colors hover:bg-muted/60",
											index === selectedResultIndex &&
												"border-primary bg-muted",
										)}
									>
										<div className="mb-1 font-medium">
											{result.page_number
												? `Page ${result.page_number}`
												: "Page unavailable"}
										</div>
										<span className="text-muted-foreground">
											{highlightText(result.snippet, findQuery)}
										</span>
									</button>
								))}
							</div>
						</>
					) : null}
				</div>
			</div>
		</aside>
	);
}
