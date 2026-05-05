"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { FileTextIcon, SearchIcon } from "lucide-react";
import {
	createContext,
	type FC,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { useChat } from "#/features/chat/context";
import { CHAT_PATH } from "#/features/chat/thread-url";
import { api } from "#/lib/api";

type CommandPaletteContextValue = {
	open: boolean;
	setOpen: (next: boolean) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
	null,
);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const value = useMemo(() => ({ open, setOpen }), [open]);

	return (
		<CommandPaletteContext.Provider value={value}>
			{children}
			<CommandPalette />
		</CommandPaletteContext.Provider>
	);
}

function useCommandPalette() {
	const value = useContext(CommandPaletteContext);
	if (!value) {
		throw new Error(
			"useCommandPalette must be used inside CommandPaletteProvider",
		);
	}
	return value;
}

const CommandPalette: FC = () => {
	const { open, setOpen } = useCommandPalette();
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [scopeAll, setScopeAll] = useState(false);
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isOnChat = pathname === CHAT_PATH;
	const {
		activeDocumentIds,
		addActiveDocument,
		setSelectedViewerItem,
		startChatWithDocument,
	} = useChat();
	const scopeSwitchId = useId();

	useEffect(() => {
		if (!open) {
			setQuery("");
			setDebouncedQuery("");
			setScopeAll(false);
		}
	}, [open]);

	useEffect(() => {
		const handle = window.setTimeout(() => setDebouncedQuery(query), 300);
		return () => window.clearTimeout(handle);
	}, [query]);

	const restrictToActive = isOnChat && !scopeAll;
	const documentIdsParam = restrictToActive ? activeDocumentIds : undefined;
	const trimmedQuery = debouncedQuery.trim();
	const queryEnabled =
		trimmedQuery.length >= 2 &&
		(!restrictToActive || activeDocumentIds.length > 0);

	const { data, isFetching } = api.documents.searchDocuments.useQuery(
		{
			query: {
				q: trimmedQuery,
				...(documentIdsParam ? { document_ids: documentIdsParam } : {}),
			},
		},
		{
			enabled: queryEnabled,
			staleTime: 10_000,
		},
	);

	const results = data?.items ?? [];

	const handleResultSelect = useCallback(
		async (document: {
			id: string;
			title?: string | null;
			chunkId?: string;
			pageNumber?: number | null;
			snippet?: string | null;
		}) => {
			setOpen(false);
			if (isOnChat) {
				addActiveDocument(document.id);
				setSelectedViewerItem({
					type: "document",
					documentId: document.id,
					title: document.title,
					chunkId: document.chunkId,
					pageNumber: document.pageNumber,
					snippet: document.snippet,
				});
				return;
			}
			const threadId = await startChatWithDocument(document.id);
			void navigate({ to: CHAT_PATH, search: { threadId } });
			setSelectedViewerItem({
				type: "document",
				documentId: document.id,
				title: document.title,
				chunkId: document.chunkId,
				pageNumber: document.pageNumber,
				snippet: document.snippet,
			});
		},
		[
			addActiveDocument,
			isOnChat,
			navigate,
			setOpen,
			setSelectedViewerItem,
			startChatWithDocument,
		],
	);

	const emptyMessage = useMemo(() => {
		if (!queryEnabled) {
			if (restrictToActive && activeDocumentIds.length === 0) {
				return "Add an active document with @, or toggle 'Search all documents'.";
			}
			return "Type at least two characters to search.";
		}
		if (isFetching) {
			return "Searching…";
		}
		return "No matches.";
	}, [queryEnabled, restrictToActive, activeDocumentIds.length, isFetching]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Search documents"
			description="Search across your document library."
			shouldFilter={false}
		>
			<CommandInput
				placeholder={
					restrictToActive
						? "Search active documents…"
						: "Search all documents…"
				}
				value={query}
				onValueChange={setQuery}
			/>
			{isOnChat ? (
				<div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground">
					<Label
						htmlFor={scopeSwitchId}
						className="cursor-pointer text-xs font-normal text-muted-foreground"
					>
						Search all documents
					</Label>
					<Switch
						id={scopeSwitchId}
						checked={scopeAll}
						onCheckedChange={setScopeAll}
					/>
				</div>
			) : null}
			<CommandList>
				<CommandEmpty>{emptyMessage}</CommandEmpty>
				{results.length > 0 ? (
					<CommandGroup heading="Documents">
						{results.map((result) => (
							<CommandItem
								key={result.chunk_id}
								value={`${result.chunk_id}`}
								onSelect={() => {
									void handleResultSelect({
										id: result.document_id,
										title: result.document_title,
										chunkId: result.chunk_id,
										pageNumber: result.page_number,
										snippet: result.snippet,
									});
								}}
							>
								<FileTextIcon className="text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="truncate font-medium">
											{result.document_title ?? "Untitled document"}
										</span>
										{result.document_original_filename ? (
											<span className="truncate text-xs text-muted-foreground">
												{result.document_original_filename}
											</span>
										) : null}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{result.snippet}
									</div>
								</div>
								{result.page_number != null ? (
									<Badge variant="secondary" className="ml-2 shrink-0">
										p. {result.page_number}
									</Badge>
								) : null}
							</CommandItem>
						))}
					</CommandGroup>
				) : null}
			</CommandList>
		</CommandDialog>
	);
};

export const CommandPaletteTrigger: FC = () => {
	const { setOpen } = useCommandPalette();

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="h-9 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-foreground"
			onClick={() => setOpen(true)}
		>
			<SearchIcon className="size-4" />
			<span className="flex-1 text-left">Search documents</span>
			<KbdGroup>
				<Kbd>⌘</Kbd>
				<Kbd>K</Kbd>
			</KbdGroup>
		</Button>
	);
};
