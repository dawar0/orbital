"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "#/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min, max],
		[value, defaultValue, min, max],
	);
	const thumbKeys = React.useMemo(() => {
		const counts = new Map<number, number>();

		return _values.map((thumbValue) => {
			const occurrence = counts.get(thumbValue) ?? 0;
			counts.set(thumbValue, occurrence + 1);
			return `${thumbValue}-${occurrence}`;
		});
	}, [_values]);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative grow overflow-hidden rounded-full bg-input/90 data-horizontal:h-2 data-horizontal:w-full data-vertical:h-full data-vertical:w-2"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
				/>
			</SliderPrimitive.Track>
			{thumbKeys.map((thumbKey) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					key={thumbKey}
					className="block h-4 w-6 shrink-0 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow,background-color] select-none not-dark:bg-clip-padding hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-vertical:h-6 data-vertical:w-4"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
