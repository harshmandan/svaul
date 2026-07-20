import { ATTR, TRANSITIONS, WINDOW_TOP_OFFSET } from "../core/constants.js";
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

/**
 * Scale factor applied to the page behind the drawer at full openness (vaul's `getScale`). This is
 * the one viewport-derived number the CSS can't compute itself (calc can't divide length by length),
 * so it's published as `--svaul-scale-factor`; the stylesheet owns the rest of the visual mapping.
 */
export function getScale(): number {
	return (window.innerWidth - WINDOW_TOP_OFFSET) / window.innerWidth;
}

interface Entry {
	depth: number;
	/** 0 = fully open (max scale-down), 1 = closed. */
	progress: number;
	direction: DrawerDirection;
	borderRadius?: number;
	setBackgroundColorOnScale: boolean;
	backgroundColor?: string;
	noBodyStyles: boolean;
}

// Registry of the currently-scaling drawers, keyed by id. The wrapper's published openness comes from
// the *shallowest* drawer (the page scales once for the root, not per nested level) and the tint level
// from the *deepest* (nesting dims further). JS only writes CSS variables + data attributes here —
// the stylesheet maps them to the actual transform / filter / background (see drawer.css).
const entries = new Map<string, Entry>();
let cachedWrapper: HTMLElement | null = null;
let revertTimer: ReturnType<typeof setTimeout> | undefined;

const WRAPPER_VARS = [
	"--svaul-scale-open",
	"--svaul-scale-factor",
	"--svaul-scale-levels",
	"--svaul-scale-radius",
	"--svaul-scale-duration"
] as const;

function wrapperEl(): HTMLElement | null {
	if (cachedWrapper?.isConnected) return cachedWrapper;
	if (typeof document === "undefined") return null;
	cachedWrapper = document.querySelector<HTMLElement>(`[${ATTR.wrapper}]`);
	return cachedWrapper;
}

function clamp01(n: number): number {
	return Math.min(Math.max(n, 0), 1);
}

function entryFrom(opts: ScaleOptions, progress: number): Entry {
	return {
		depth: opts.depth,
		progress,
		direction: opts.direction,
		borderRadius: opts.borderRadius,
		setBackgroundColorOnScale: opts.setBackgroundColorOnScale,
		backgroundColor: opts.backgroundColor,
		noBodyStyles: opts.noBodyStyles
	};
}

/** Publish the wrapper's openness/levels/factor as CSS variables + data attributes. */
function applyToWrapper(animate: boolean): void {
	const wrapper = wrapperEl();
	if (!wrapper) return;

	let shallow: Entry | null = null;
	let deepest: Entry | null = null;
	for (const e of entries.values()) {
		if (!shallow || e.depth < shallow.depth) shallow = e;
		if (!deepest || e.depth > deepest.depth) deepest = e;
	}
	if (!shallow || !deepest) return;

	// Openness of the page (shallowest drawer); tint compounds with nesting depth (deepest drawer).
	const open = 1 - clamp01(shallow.progress);
	const levels = deepest.depth + (1 - clamp01(deepest.progress));

	const s = wrapper.style;
	wrapper.setAttribute(ATTR.scaled, "");
	wrapper.setAttribute(ATTR.scaleDirection, shallow.direction);

	// A live drag freezes the transition (0s); at rest the stylesheet's default duration animates.
	if (animate) {
		// Coming out of a frozen drag, re-enable the transition and flush it with the CURRENT values
		// FIRST (via a reflow), then change the target below. Some engines won't start a transition when
		// transition-duration goes 0s → non-zero in the same frame as the animated value, and snap
		// instead — the same paint-boundary the drawer gets for free from its reactive attribute.
		const wasFrozen = s.getPropertyValue("--svaul-scale-duration") === "0s";
		s.removeProperty("--svaul-scale-duration");
		if (wasFrozen) void wrapper.offsetHeight;
	} else {
		s.setProperty("--svaul-scale-duration", "0s");
	}

	s.setProperty("--svaul-scale-open", String(open));
	s.setProperty("--svaul-scale-factor", String(getScale()));
	s.setProperty("--svaul-scale-levels", String(levels));
	if (shallow.borderRadius != null) s.setProperty("--svaul-scale-radius", `${shallow.borderRadius}px`);
}

/** Toggle the body tint (a data attribute + a custom property — never overwrites the author's
 *  `background`, so nothing needs saving/restoring). */
function applyToBody(): void {
	if (typeof document === "undefined") return;
	const body = document.body;
	let tint: Entry | undefined;
	for (const e of entries.values()) {
		if (e.setBackgroundColorOnScale && !e.noBodyStyles) {
			tint = e;
			break;
		}
	}
	if (tint) {
		body.setAttribute(ATTR.scaled, "");
		if (tint.backgroundColor != null) body.style.setProperty("--svaul-scale-bg", tint.backgroundColor);
		else body.style.removeProperty("--svaul-scale-bg");
	} else {
		body.removeAttribute(ATTR.scaled);
		body.style.removeProperty("--svaul-scale-bg");
	}
}

/** Register a drawer on open. */
export function acquireScale(opts: ScaleOptions): void {
	if (revertTimer) {
		clearTimeout(revertTimer);
		revertTimer = undefined;
	}
	entries.set(opts.id, entryFrom(opts, 1));
	applyToWrapper(opts.animate ?? true);
	applyToBody();
}

/**
 * Set this drawer's openness. `progress` 0 → fully open (max scale-down / lift); 1 → closed. Snap
 * drawers pass `activeOffset / viewport` so the backdrop tracks how open they are.
 */
export function scaleBackground(progress: number, opts: ScaleOptions): void {
	entries.set(opts.id, entryFrom(opts, progress));
	applyToWrapper(opts.animate ?? true);
	applyToBody();
}

/** Release on close. If other drawers remain the wrapper eases to the now-deepest level; the last
 *  release eases the published openness to 0 (the stylesheet animates back to identity) and then
 *  strips the attributes/variables once the transition settles. */
export function revertScaleBackground(opts: ScaleOptions): void {
	entries.delete(opts.id);
	applyToBody();

	if (entries.size > 0) {
		applyToWrapper(opts.animate ?? true); // step back to the now-deepest drawer
		return;
	}

	const wrapper = wrapperEl();
	if (!wrapper) {
		cachedWrapper = null;
		return;
	}

	const animate = (opts.animate ?? true) && typeof setTimeout !== "undefined";
	// Keep the scaled rule (and its transition) active while easing openness → 0, so the transform,
	// brightness, and radius all animate back to identity instead of snapping.
	const s = wrapper.style;
	s.setProperty("--svaul-scale-open", "0");
	s.setProperty("--svaul-scale-levels", "0");
	s.setProperty("--svaul-scale-radius", "0px");
	if (animate) s.removeProperty("--svaul-scale-duration");
	else s.setProperty("--svaul-scale-duration", "0s");

	const cleanup = () => {
		// Re-query: the DOM may have been restructured (SPA nav) during the animation.
		const current = wrapperEl() ?? wrapper;
		current.removeAttribute(ATTR.scaled);
		current.removeAttribute(ATTR.scaleDirection);
		for (const v of WRAPPER_VARS) current.style.removeProperty(v);
		cachedWrapper = null;
	};

	if (revertTimer) clearTimeout(revertTimer);
	if (animate) revertTimer = setTimeout(cleanup, TRANSITIONS.DURATION * 1000);
	else cleanup();
}
