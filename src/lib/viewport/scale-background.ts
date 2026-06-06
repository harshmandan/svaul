import { ATTR, BORDER_RADIUS, TRANSITIONS, TRANSITION_EASE, WINDOW_TOP_OFFSET } from "../core/constants.js";
import { isVertical, set } from "../core/dom.js";
import type { DrawerDirection } from "../core/types.js";

export interface ScaleOptions {
	direction: DrawerDirection;
	setBackgroundColorOnScale: boolean;
	noBodyStyles: boolean;
	/** Body color while scaled (default "black"). */
	backgroundColor?: string;
	/** Wrapper corner radius (px) at full scale-down. */
	borderRadius?: number;
	/** Animate the change (true for open/snap rest, false for live drag). */
	animate?: boolean;
}

/** Scale factor applied to the page behind the drawer at full openness (vaul's `getScale`). */
export function getScale(): number {
	return (window.innerWidth - WINDOW_TOP_OFFSET) / window.innerWidth;
}

/** Honor the user's reduced-motion preference (the wrapper is styled via JS, so it
 *  isn't covered by the CSS `@media (prefers-reduced-motion)` block). */
function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

// Ref-counted so independent drawers compose: the body color is saved once (first
// acquirer) and the wrapper is only reverted when the last drawer releases.
let scaleCount = 0;
let savedBodyBackground: string | null = null;
let cachedWrapper: HTMLElement | null = null;
let revertTimer: ReturnType<typeof setTimeout> | undefined;

function wrapperEl(): HTMLElement | null {
	if (cachedWrapper?.isConnected) return cachedWrapper;
	if (typeof document === "undefined") return null;
	cachedWrapper = document.querySelector<HTMLElement>(`[${ATTR.wrapper}]`);
	return cachedWrapper;
}

const WRAPPER_PROPS = [
	"transform",
	"borderRadius",
	"overflow",
	"transformOrigin",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction"
] as const;

/** Acquire the scaled background on open (ref-counted; paints the body once). */
export function acquireScale(opts: ScaleOptions): void {
	if (revertTimer) {
		clearTimeout(revertTimer);
		revertTimer = undefined;
	}
	scaleCount++;
	if (
		scaleCount === 1 &&
		opts.setBackgroundColorOnScale &&
		!opts.noBodyStyles &&
		typeof document !== "undefined" &&
		savedBodyBackground === null
	) {
		savedBodyBackground = document.body.style.background;
		document.body.style.background = opts.backgroundColor ?? "black";
	}
}

/**
 * Set the wrapper scale to a given openness. `progress` 0 → fully open (max scale-down /
 * card-stack lift); 1 → closed (no scale). For snap drawers pass `activeOffset / viewport`
 * so the backdrop tracks how open the drawer is.
 */
export function scaleBackground(progress: number, opts: ScaleOptions): void {
	const wrapper = wrapperEl();
	if (!wrapper) return;

	const { direction, borderRadius = BORDER_RADIUS } = opts;
	const p = Math.min(Math.max(progress, 0), 1);

	const scale = Math.min(getScale() + p * (1 - getScale()), 1);
	const radius = borderRadius - p * borderRadius;
	const translate = Math.max(0, 14 - p * 14);
	// The safe-area inset only applies to the vertical (top) lift, not the horizontal axis.
	const transform = isVertical(direction)
		? `scale(${scale}) translate3d(0, calc(env(safe-area-inset-top) + ${translate}px), 0)`
		: `scale(${scale}) translate3d(${translate}px, 0, 0)`;

	const animate = opts.animate && !prefersReducedMotion();
	set(
		wrapper,
		{
			transformOrigin: isVertical(direction) ? "top" : "left",
			overflow: "hidden",
			borderRadius: `${radius}px`,
			transform,
			transitionProperty: "transform, border-radius",
			transitionDuration: animate ? `${TRANSITIONS.DURATION}s` : "0s",
			transitionTimingFunction: TRANSITION_EASE
		},
		true
	);
}

/** Release on close; only the last drawer animates back and clears the inline styles. */
export function revertScaleBackground(noBodyStyles: boolean, animate = true): void {
	scaleCount = Math.max(0, scaleCount - 1);
	if (scaleCount > 0) return; // another drawer is still scaling the background

	const wrapper = wrapperEl();
	if (!wrapper) return;
	const shouldAnimate = animate && !prefersReducedMotion();
	set(
		wrapper,
		{
			borderRadius: "0px",
			transform: "scale(1) translate3d(0, 0, 0)",
			transitionProperty: "transform, border-radius",
			transitionDuration: shouldAnimate ? `${TRANSITIONS.DURATION}s` : "0s",
			transitionTimingFunction: TRANSITION_EASE
		},
		true
	);

	if (revertTimer) clearTimeout(revertTimer);
	// Clear the inline styles once the revert settles (immediately when not animating).
	// Re-query the wrapper inside the timeout: the DOM may have been restructured
	// (e.g. route change) during the animation, so the captured ref could be stale.
	revertTimer = setTimeout(
		() => {
			const current = wrapperEl() ?? wrapper;
			for (const prop of WRAPPER_PROPS) current.style[prop] = "";
			if (!noBodyStyles && savedBodyBackground !== null) {
				document.body.style.background = savedBodyBackground;
				savedBodyBackground = null;
			}
			cachedWrapper = null;
		},
		shouldAnimate ? TRANSITIONS.DURATION * 1000 : 0
	);
}
