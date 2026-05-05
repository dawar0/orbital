import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const [theme, setTheme] = useState<ToasterProps["theme"]>("system");

	useEffect(() => {
		const root = document.documentElement;
		const getTheme = () => {
			if (root.classList.contains("dark")) {
				return "dark";
			}

			if (root.classList.contains("light")) {
				return "light";
			}

			return "system";
		};
		const syncTheme = () => {
			setTheme(getTheme());
		};
		const observer = new MutationObserver(syncTheme);

		syncTheme();
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class", "data-theme", "style"],
		});

		return () => observer.disconnect();
	}, []);

	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
