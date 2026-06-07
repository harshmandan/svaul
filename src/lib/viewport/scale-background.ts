import { ATTR, BORDER_RADIUS, TRANSITIONS, TRANSITION_EASE, WINDOW_TOP_OFFSET } from "../core/constants.js";
import { isVertical, set } from "../core/dom.js";
import type { DrawerDirection } from "../core/types.js";

export interface ScaleOptions {
	/** Unique per-drawer id (its content id) — keys this drawer's entry in the registry. */
	id: string;
	/** Nesting depth (0 = root). Drives how far the background compounds. */
	depth: number;
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

/** Lift (px) the scaled page slides down by, and the per-level dimming step / floor. */
const LIFT = 14;
const DARK_STEP = 0.12;
const DARK_MIN = 0.5;
const SCALE_MIN = 0.6;

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

interface Entry {
	depth: number;
	/** 0 = fully open (max scale-down), 1 = closed. */
	progress: number;
	direction: DrawerDirection;
	borderRadius?: number;
}

// Registry of the currently-scaling drawers, keyed by id. The wrapper's scale + tint are
// recomputed from the *deepest* open drawer so nested drawers compound (each level steps the
// page back and dims it further); the body color is saved once and restored when all release.
const entries = new Map<string, Entry>();
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
	"filter",
	"borderRadius",
	"overflow",
	"transformOrigin",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction"
] as const;

/** Recompute the wrapper transform + brightness from the deepest open drawer. */
function recompute(animate: boolean): void {
	const wrapper = wrapperEl();
	if (!wrapper) return;

	let shallow: Entry | null = null;
	let deepest: Entry | null = null;
	for (const e of entries.values()) {
		if (!shallow || e.depth < shallow.depth) shallow = e;
		if (!deepest || e.depth > deepest.depth) deepest = e;
	}
	if (!shallow || !deepest) return;

	// The PAGE only scales for the root (shallowest) drawer — it does NOT compound as
	// nested drawers open (those step back the *drawers*, not the page again). A single
	// drawer reproduces the original behavior exactly (scale getScale()→1).
	const pRoot = Math.min(Math.max(shallow.progress, 0), 1);
	const open = 1 - pRoot;
	const base = 1 - getScale();
	const scale = Math.max(Math.min(1 - base * open, 1), SCALE_MIN);
	const radius = (shallow.borderRadius ?? BORDER_RADIUS) * open;
	const translate = LIFT * open;
	const dir = shallow.direction;

	// The tint DOES compound with nesting depth — each level dims the page another step.
	const pDeep = Math.min(Math.max(deepest.progress, 0), 1);
	const levels = deepest.depth + (1 - pDeep);
	const brightness = Math.max(1 - DARK_STEP * Math.max(0, levels - 1), DARK_MIN);
	// The safe-area inset only applies to the vertical (top) lift, not the horizontal axis.
	const transform = isVertical(dir)
		? `scale(${scale}) translate3d(0, calc(env(safe-area-inset-top) + ${translate}px), 0)`
		: `scale(${scale}) translate3d(${translate}px, 0, 0)`;

	const shouldAnimate = animate && !prefersReducedMotion();
	set(
		wrapper,
		{
			transformOrigin: isVertical(dir) ? "top" : "left",
			overflow: "hidden",
			borderRadius: `${radius}px`,
			transform,
			filter: `brightness(${brightness})`,
			transitionProperty: "transform, border-radius, filter",
			transitionDuration: shouldAnimate ? `${TRANSITIONS.DURATION}s` : "0s",
			transitionTimingFunction: TRANSITION_EASE
		},
		true
	);
}

/** Register a drawer on open and paint the body color once (first acquirer). */
export function acquireScale(opts: ScaleOptions): void {
	if (revertTimer) {
		clearTimeout(revertTimer);
		revertTimer = undefined;
	}
	const first = entries.size === 0;
	entries.set(opts.id, {
		depth: opts.depth,
		progress: 1,
		direction: opts.direction,
		borderRadius: opts.borderRadius
	});
	if (
		first &&
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
 * Set this drawer's openness. `progress` 0 → fully open (max scale-down / lift); 1 → closed.
 * Snap drawers pass `activeOffset / viewport` so the backdrop tracks how open they are. The
 * wrapper is recomputed from the deepest open drawer, so nested drawers compound.
 */
export function scaleBackground(progress: number, opts: ScaleOptions): void {
	entries.set(opts.id, {
		depth: opts.depth,
		progress,
		direction: opts.direction,
		borderRadius: opts.borderRadius
	});
	recompute(opts.animate ?? true);
}

/** Release on close. If other drawers remain the wrapper eases back to the next level;
 *  only the last release animates to identity and clears the inline styles. */
export function revertScaleBackground(opts: ScaleOptions, noBodyStyles: boolean): void {
	entries.delete(opts.id);
	const shouldAnimate = (opts.animate ?? true) && !prefersReducedMotion();

	if (entries.size > 0) {
		recompute(opts.animate ?? true); // step back to the now-deepest drawer
		return;
	}

	const wrapper = wrapperEl();
	if (!wrapper) return;
	set(
		wrapper,
		{
			borderRadius: "0px",
			transform: "scale(1) translate3d(0, 0, 0)",
			filter: "brightness(1)",
			transitionProperty: "transform, border-radius, filter",
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
