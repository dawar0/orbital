import dayjs from "dayjs";
import { startCase } from "lodash-es";
import {
	BadgeCheck,
	CircleAlert,
	CircleX,
	LoaderCircle,
	Trash2,
} from "lucide-react";
import type { DocumentStatus } from "./types";

export const documentTableColumns = [
	"Title",
	"Filename",
	"Status",
	"Size",
	"Uploaded",
	"Indexed",
	"Actions",
] as const;

export const skeletonRowIds = [
	"skeleton-row-1",
	"skeleton-row-2",
	"skeleton-row-3",
	"skeleton-row-4",
	"skeleton-row-5",
	"skeleton-row-6",
];

const ongoingDocumentStatuses = new Set<DocumentStatus>([
	"uploaded",
	"processing",
]);

export function getDefaultTitle(fileName: string) {
	return fileName.replace(/\.[^/.]+$/, "");
}

export function truncateText(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 1)}…`;
}

export function formatBytes(sizeBytes: number) {
	if (sizeBytes === 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const exponent = Math.min(
		Math.floor(Math.log(sizeBytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = sizeBytes / 1024 ** exponent;

	return `${new Intl.NumberFormat(undefined, {
		maximumFractionDigits: value >= 10 ? 0 : 1,
	}).format(value)} ${units[exponent]}`;
}

export function formatDate(value: string | null | undefined) {
	if (!value) {
		return "\u2014";
	}

	return dayjs(value).format("MMM D, YYYY h:mm A");
}

export function isDocumentProcessing(status: DocumentStatus) {
	return ongoingDocumentStatuses.has(status);
}

export function getDocumentStatusMeta(status: DocumentStatus) {
	switch (status) {
		case "ready":
			return {
				variant: "outline" as const,
				icon: BadgeCheck,
				label: startCase(status),
				className:
					"border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300",
			};
		case "processing":
			return {
				variant: "outline" as const,
				icon: LoaderCircle,
				iconClassName: "animate-spin",
				label: startCase(status),
				className:
					"border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300",
			};
		case "uploaded":
			return {
				variant: "outline" as const,
				icon: LoaderCircle,
				iconClassName: "animate-spin",
				label: startCase(status),
				className:
					"border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300",
			};
		case "failed":
			return {
				variant: "destructive" as const,
				icon: CircleX,
				label: startCase(status),
			};
		case "deleted":
			return {
				variant: "outline" as const,
				icon: Trash2,
				label: startCase(status),
				className: "border-border bg-muted text-muted-foreground",
			};
		default:
			return {
				variant: "secondary" as const,
				icon: CircleAlert,
				label: startCase(status),
			};
	}
}
