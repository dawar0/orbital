"use client";

import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { CommandPaletteProvider } from "#/components/command-palette";
import ThemeToggle from "#/components/theme-toggle";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { ChatRuntimeProvider } from "#/features/chat/components/chat-runtime-provider";
import { CHAT_PATH } from "#/features/chat/thread-url";

const pageDetails = {
	"/": {
		label: "Documents",
	},
	[CHAT_PATH]: {
		label: "",
	},
} as const;

function getPageDetails(pathname: string) {
	return (
		pageDetails[pathname as keyof typeof pageDetails] ?? pageDetails[CHAT_PATH]
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const page = getPageDetails(pathname);

	return (
		<ChatRuntimeProvider>
			<CommandPaletteProvider>
				<AppShellFrame pageLabel={page.label}>{children}</AppShellFrame>
			</CommandPaletteProvider>
		</ChatRuntimeProvider>
	);
}

function AppShellFrame({
	children,
	pageLabel,
}: {
	children: ReactNode;
	pageLabel: string;
}) {
	return (
		<SidebarProvider className="h-svh overflow-hidden">
			<AppSidebar variant="inset" />
			<SidebarInset className="min-h-0 overflow-hidden">
				<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger />
					<Separator
						orientation="vertical"
						className="mr-2 self-stretch data-[orientation=vertical]:h-full"
					/>
					{pageLabel ? (
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbPage>{pageLabel}</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					) : null}
					<div className="ml-auto">
						<ThemeToggle />
					</div>
				</header>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
