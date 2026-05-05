"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
	type CodeHeaderProps,
	MarkdownTextPrimitive,
	unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
	useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ComponentProps, type FC, memo, useState } from "react";
import remarkGfm from "remark-gfm";

import {
	CitationPopover,
	getCitationHref,
	getCitationIndexFromHref,
	useMessageCitations,
} from "#/components/assistant-ui/citations";
import { TooltipIconButton } from "#/components/assistant-ui/tooltip-icon-button";
import { useChat } from "#/features/chat/context";
import { cn } from "#/lib/utils";

const citationMarkerPattern = /\[(\d+)\]/g;
const citationLabelPattern = /^\[(\d+)\]$/;

function splitCitationMarkers(value: string) {
	const nodes: Array<Record<string, unknown>> = [];
	let lastIndex = 0;

	citationMarkerPattern.lastIndex = 0;

	for (const match of value.matchAll(citationMarkerPattern)) {
		const fullMatch = match[0];
		const rawIndex = match[1];
		const matchIndex = match.index ?? 0;
		const citationNumber = Number(rawIndex);

		if (Number.isNaN(citationNumber)) {
			continue;
		}

		if (matchIndex > lastIndex) {
			nodes.push({
				type: "text",
				value: value.slice(lastIndex, matchIndex),
			});
		}

		nodes.push({
			type: "link",
			title: null,
			url: getCitationHref(citationNumber - 1),
			children: [
				{
					type: "text",
					value: fullMatch,
				},
			],
		});
		lastIndex = matchIndex + fullMatch.length;
	}

	if (nodes.length === 0) {
		return null;
	}

	if (lastIndex < value.length) {
		nodes.push({
			type: "text",
			value: value.slice(lastIndex),
		});
	}

	return nodes;
}

function transformCitationMarkers(node: Record<string, unknown>) {
	const children = Array.isArray(node.children)
		? (node.children as Array<Record<string, unknown>>)
		: null;

	if (!children) {
		return;
	}

	const nextChildren: Array<Record<string, unknown>> = [];

	for (const child of children) {
		if (child.type === "text" && typeof child.value === "string") {
			const replacement = splitCitationMarkers(child.value);

			if (replacement) {
				nextChildren.push(...replacement);
				continue;
			}
		}

		if (child.type !== "link" && child.type !== "definition") {
			transformCitationMarkers(child);
		}

		nextChildren.push(child);
	}

	node.children = nextChildren;
}

function remarkCitationMarkers() {
	return (tree: Record<string, unknown>) => {
		transformCitationMarkers(tree);
	};
}

function getCitationIndexFromChildren(
	children: ComponentProps<"a">["children"],
) {
	const textContent = Array.isArray(children)
		? children.join("")
		: typeof children === "string" || typeof children === "number"
			? String(children)
			: "";
	const match = textContent.match(citationLabelPattern);

	if (!match) {
		return null;
	}

	const rawIndex = Number(match[1]);

	if (!Number.isInteger(rawIndex) || rawIndex < 1) {
		return null;
	}

	return rawIndex - 1;
}

function MarkdownCitationLink({
	href,
	className,
	children,
	...props
}: ComponentProps<"a">) {
	const citationIndex =
		getCitationIndexFromHref(href) ?? getCitationIndexFromChildren(children);
	const citations = useMessageCitations();
	const { setSelectedCitation } = useChat();

	if (citationIndex == null) {
		return (
			<a
				className={cn(
					"aui-md-a text-primary underline underline-offset-2 hover:text-primary/80",
					className,
				)}
				href={href}
				{...props}
			>
				{children}
			</a>
		);
	}

	const citation = citations[citationIndex];

	if (!citation) {
		return <span className="text-[0.7rem] align-super">{children}</span>;
	}

	return (
		<CitationPopover
			citation={citation}
			onClick={() => setSelectedCitation({ citation, index: citationIndex })}
			variant="inline"
			className={cn("-translate-y-0.5 align-super leading-none", className)}
		>
			[{citationIndex + 1}]
		</CitationPopover>
	);
}

const MarkdownTextImpl = () => {
	return (
		<MarkdownTextPrimitive
			remarkPlugins={[remarkGfm, remarkCitationMarkers]}
			className="aui-md"
			components={defaultComponents}
		/>
	);
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
	const { isCopied, copyToClipboard } = useCopyToClipboard();
	const onCopy = () => {
		if (!code || isCopied) return;
		copyToClipboard(code);
	};

	return (
		<div className="aui-code-header-root mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs">
			<span className="aui-code-header-language font-medium text-muted-foreground lowercase">
				{language}
			</span>
			<TooltipIconButton tooltip="Copy" onClick={onCopy}>
				{!isCopied && <CopyIcon />}
				{isCopied && <CheckIcon />}
			</TooltipIconButton>
		</div>
	);
};

const useCopyToClipboard = ({
	copiedDuration = 3000,
}: {
	copiedDuration?: number;
} = {}) => {
	const [isCopied, setIsCopied] = useState<boolean>(false);

	const copyToClipboard = (value: string) => {
		if (!value) return;

		navigator.clipboard.writeText(value).then(() => {
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), copiedDuration);
		});
	};

	return { isCopied, copyToClipboard };
};

const defaultComponents = memoizeMarkdownComponents({
	h1: ({ className, ...props }) => (
		<h1
			className={cn(
				"aui-md-h1 mb-2 scroll-m-20 font-semibold text-base first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h2: ({ className, ...props }) => (
		<h2
			className={cn(
				"aui-md-h2 mt-3 mb-1.5 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h3: ({ className, ...props }) => (
		<h3
			className={cn(
				"aui-md-h3 mt-2.5 mb-1 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h4: ({ className, ...props }) => (
		<h4
			className={cn(
				"aui-md-h4 mt-2 mb-1 scroll-m-20 font-medium text-sm first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h5: ({ className, ...props }) => (
		<h5
			className={cn(
				"aui-md-h5 mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	h6: ({ className, ...props }) => (
		<h6
			className={cn(
				"aui-md-h6 mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	p: ({ className, ...props }) => (
		<p
			className={cn(
				"aui-md-p my-2.5 leading-normal first:mt-0 last:mb-0",
				className,
			)}
			{...props}
		/>
	),
	a: ({ className, ...props }) => (
		<MarkdownCitationLink className={className} {...props} />
	),
	blockquote: ({ className, ...props }) => (
		<blockquote
			className={cn(
				"aui-md-blockquote my-2.5 border-muted-foreground/30 border-l-2 pl-3 text-muted-foreground italic",
				className,
			)}
			{...props}
		/>
	),
	ul: ({ className, ...props }) => (
		<ul
			className={cn(
				"aui-md-ul my-2 ml-4 list-disc marker:text-muted-foreground [&>li]:mt-1",
				className,
			)}
			{...props}
		/>
	),
	ol: ({ className, ...props }) => (
		<ol
			className={cn(
				"aui-md-ol my-2 ml-4 list-decimal marker:text-muted-foreground [&>li]:mt-1",
				className,
			)}
			{...props}
		/>
	),
	hr: ({ className, ...props }) => (
		<hr
			className={cn("aui-md-hr my-2 border-muted-foreground/20", className)}
			{...props}
		/>
	),
	table: ({ className, ...props }) => (
		<table
			className={cn(
				"aui-md-table my-2 w-full border-separate border-spacing-0 overflow-y-auto",
				className,
			)}
			{...props}
		/>
	),
	th: ({ className, ...props }) => (
		<th
			className={cn(
				"aui-md-th bg-muted px-2 py-1 text-left font-medium first:rounded-tl-lg last:rounded-tr-lg [[align=center]]:text-center [[align=right]]:text-right",
				className,
			)}
			{...props}
		/>
	),
	td: ({ className, ...props }) => (
		<td
			className={cn(
				"aui-md-td border-muted-foreground/20 border-b border-l px-2 py-1 text-left last:border-r [[align=center]]:text-center [[align=right]]:text-right",
				className,
			)}
			{...props}
		/>
	),
	tr: ({ className, ...props }) => (
		<tr
			className={cn(
				"aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
				className,
			)}
			{...props}
		/>
	),
	li: ({ className, ...props }) => (
		<li className={cn("aui-md-li leading-normal", className)} {...props} />
	),
	sup: ({ className, ...props }) => (
		<sup
			className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
			{...props}
		/>
	),
	pre: ({ className, ...props }) => (
		<pre
			className={cn(
				"aui-md-pre overflow-x-auto rounded-t-none rounded-b-lg border border-border/50 border-t-0 bg-muted/30 p-3 text-xs leading-relaxed",
				className,
			)}
			{...props}
		/>
	),
	code: function Code({ className, ...props }) {
		const isCodeBlock = useIsMarkdownCodeBlock();
		return (
			<code
				className={cn(
					!isCodeBlock &&
						"aui-md-inline-code rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em]",
					className,
				)}
				{...props}
			/>
		);
	},
	CodeHeader,
});
