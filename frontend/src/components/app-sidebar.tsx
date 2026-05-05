"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { FileText, MessageSquareText } from "lucide-react";
import { ThreadList } from "#/components/assistant-ui/thread-list";
import { CommandPaletteTrigger } from "#/components/command-palette";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "#/components/ui/sidebar";
import { CHAT_PATH } from "#/features/chat/thread-url";

type AppPath = "/" | typeof CHAT_PATH;

type NavigationItem = {
	title: string;
	to: AppPath;
	icon: LucideIcon;
};

const navigation: NavigationItem[] = [
	{
		title: "Documents",
		to: "/",
		icon: FileText,
	},
	{
		title: "Chat",
		to: CHAT_PATH,
		icon: MessageSquareText,
	},
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<div className="flex items-center gap-3 rounded-md px-2 py-2">
					<div className="flex aspect-square size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
						<span className="text-sm font-bold tracking-tight">O</span>
					</div>
					<div className="min-w-0 group-data-[collapsible=icon]:hidden">
						<span className="block truncate text-[1.1rem] leading-none font-semibold tracking-tight text-sidebar-foreground">
							Orbital
						</span>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupContent>
						<CommandPaletteTrigger />
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navigation.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.to}
										tooltip={item.title}
									>
										<Link to={item.to}>
											<item.icon />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Chats</SidebarGroupLabel>
					<SidebarGroupContent>
						<ThreadList />
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
