import { untrack } from "svelte";
import { TRANSITIONS, TRANSITION_EASE, VELOCITY_THRESHOLD, FLING_VELOCITY } from "../core/constants.js";
import { isVertical, set } from "../core/dom.js";
import { extract, isDefined } from "../core/reactivity.svelte.js";
import type { DrawerDirection, MaybeGetter, SnapPoint } from "../core/types.js";

export interface SnapPointsDeps {
	snapPoints: () => SnapPoint[] | undefined;
	/** Resolved fade-from index (defaults to last index when the user omits it). */
	fadeFromIndex: () => number | undefined;
	direction: () => DrawerDirection;
	container: () => HTMLElement | null | undefined;
	snapToSequentialPoint: () => boolean;
	/** Controlled active snap point (getter), or undefined for uncontrolled. */
	activeSnapPoint?: MaybeGetter<SnapPoint | null | undefined>;
	onActiveSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	drawerEl: () => HTMLElement | null;
	overlayEl: () => HTMLElement | null;
}

const trans = (prop: "transform" | "opacity") =>
	`${prop} ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`;

const CALC_TERM = /([+-]?\s*\d*\.?\d+)\s*(px|%|rem|vh|vw)/gi;
const warnedSnapPoints = new Set<string>();

function warnSnapPoint(point: SnapPoint, reason: string): void {
	const key = String(point);
	if (warnedSnapPoints.has(key) || typeof console === "undefined") return;
	warnedSnapPoints.add(key);
	console.warn(`[svaul] snap point ${JSON.stringify(point)}: ${reason}`);
}

/** Root font size (for `rem`), SSR-safe. */
function rootFontSize(): number {
	if (typeof window === "undefined") return 16;
	const fs = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
	return Number.isFinite(fs) && fs > 0 ? fs : 16;
}

function resolveUnit(n: number, unit: string, size: number): number {
	switch (unit) {
		case "px":
			return n;
		case "%":
			return (n / 100) * size;
		case "rem":
			return n * rootFontSize();
		case "vh":
			return (n / 100) * (typeof window !== "undefined" ? window.innerHeight : 0);
		case "vw":
			return (n / 100) * (typeof window !== "undefined" ? window.innerWidth : 0);
		default:
			return 0;
	}
}

/**
 * Resolve a snap point to a pixel length against `size` (the viewport/container extent), clamped to
 * `[0, size]` so an oversized value can never rest the drawer off-screen past the fully-open edge.
 * Accepts:
 *  - numbers/unit-less strings: `≤ 1` is a fraction of `size`, `> 1` is pixels (e.g. `0.5`, `"180"`);
 *  - single units: `"180px"`, `"50%"`, `"12rem"`, `"40vh"`, `"30vw"`;
 *  - `calc()` sums of the above (`"calc(50% + 24px)"`, `"calc(100% - 40px)"`).
 * An unrecognized/empty expression resolves to 0 and warns (once) instead of silently misbehaving.
 */
function resolveLength(point: SnapPoint, size: number): number {
	const clamp = (len: number) => Math.min(Math.max(len, 0), size);

	if (typeof point === "number") return clamp(point <= 1 ? point * size : point);
	const raw = point.trim();
	// A unit-less numeric string follows the same ≤1 fraction / >1 pixel rule as the number form.
	if (/^[+-]?\d*\.?\d+$/.test(raw)) {
		const n = Number.parseFloat(raw);
		return clamp(n <= 1 ? n * size : n);
	}
	const expr = raw.replace(/^calc\(/i, "").replace(/\)$/, "");
	let total = 0;
	let matched = false;
	let m: RegExpExecArray | null;
	CALC_TERM.lastIndex = 0;
	while ((m = CALC_TERM.exec(expr))) {
		matched = true;
		const n = Number.parseFloat(m[1].replace(/\s+/g, ""));
		total += resolveUnit(n, m[2].toLowerCase(), size);
	}
	if (!matched) {
		warnSnapPoint(point, "could not be parsed; resolving to 0");
		return 0;
	}
	// Any alphabetic residue means the expression carried a unit we don't understand (`em`, `ch`, …)
	// → the sum above is a partial (silently wrong) resolve. Warn so it's visible.
	const leftover = expr.replace(CALC_TERM, "").replace(/[\s+\-*/().]/g, "");
	if (leftover.length) warnSnapPoint(point, `contains an unsupported unit in "${raw}"; ignoring it`);
	return clamp(total);
}

/**
 * Snap-point engine, ported from vaul's `use-snap-points.ts`. Owns the active snap
 * point (controlled or internal), computes per-point pixel offsets for all four
 * directions, and drives the snap/drag/release transforms + overlay fade.
 */
export class SnapPointsEngine {
	#deps: SnapPointsDeps;
	#internalActive = $state<SnapPoint | null>(null);
	#windowDims = $state({
		w: typeof window !== "undefined" ? window.innerWidth : 0,
		h: typeof window !== "undefined" ? window.innerHeight : 0
	});
	/** Live size of the `container` (when set), tracked via ResizeObserver so offsets reflow. */
	#containerDims = $state<{ w: number; h: number } | null>(null);
	#appliedInitial = false;

	constructor(deps: SnapPointsDeps) {
		this.#deps = deps;
		// Seed from the *sorted* first point so the very first open matches every later one.
		this.#internalActive = this.snapPointsArr[0] ?? null;

		// Track viewport size so offsets reflow on resize / rotation.
		$effect(() => {
			const onResize = () => (this.#windowDims = { w: window.innerWidth, h: window.innerHeight });
			window.addEventListener("resize", onResize);
			return () => window.removeEventListener("resize", onResize);
		});

		// Reflow container-relative offsets when the container itself resizes/rotates — the
		// window `resize` above only covers the no-container path.
		$effect(() => {
			const container = this.#deps.container();
			if (!container || typeof ResizeObserver === "undefined") {
				this.#containerDims = null;
				return;
			}
			const ro = new ResizeObserver(() => {
				const r = container.getBoundingClientRect();
				this.#containerDims = { w: r.width, h: r.height };
			});
			ro.observe(container);
			return () => {
				ro.disconnect();
				this.#containerDims = null;
			};
		});

		// Keep the internal active point valid as snapPoints arrive or change (uncontrolled
		// only). Without this, points measured into existence after construction leave the
		// active point null → the drawer opens fully off-screen with scroll locked and focus
		// trapped; and dropping the active value from the array strands the index at -1 → frozen.
		$effect(() => {
			const arr = this.snapPointsArr; // track sorted points
			if (isDefined(this.#deps.activeSnapPoint)) return; // controlled — the user owns it
			untrack(() => {
				const cur = this.#internalActive;
				if (arr.length === 0) {
					if (cur !== null) this.#internalActive = null;
				} else if (cur === null || !arr.includes(cur)) {
					this.#internalActive = arr[0];
				}
			});
		});

		// Reposition whenever the element mounts or the active point / offsets change.
		$effect(() => {
			const drawer = this.#deps.drawerEl(); // track mount/unmount
			if (!drawer) {
				this.#appliedInitial = false; // re-arm the enter animation for next mount
				return;
			}
			const active = this.activeSnapPoint;
			const offsets = this.snapPointsOffset;
			const idx = this.activeSnapPointIndex;
			if (active == null || idx < 0 || typeof offsets[idx] !== "number") return;
			const dimension = offsets[idx];
			if (!this.#appliedInitial) {
				// Let the element paint at its off-screen CSS start, then transition in.
				this.#appliedInitial = true;
				const raf = requestAnimationFrame(() => this.#applyTransform(dimension));
				return () => cancelAnimationFrame(raf);
			}
			this.#applyTransform(dimension);
		});
	}

	// ---------------------------------------------------------------- active state
	get activeSnapPoint(): SnapPoint | null {
		if (isDefined(this.#deps.activeSnapPoint)) {
			return extract(this.#deps.activeSnapPoint, null);
		}
		return this.#internalActive;
	}

	setActiveSnapPoint(value: SnapPoint | null): void {
		if (value === this.activeSnapPoint) return;
		if (!isDefined(this.#deps.activeSnapPoint)) this.#internalActive = value;
		this.#deps.onActiveSnapPointChange?.(value);
	}

	// ---------------------------------------------------------------- derived
	/** Resolve one snap point to its drawer height + rest offset for the current direction. */
	#resolve(point: SnapPoint): { height: number; offset: number } {
		const dir = this.#deps.direction();
		const container = this.#deps.container();
		// Reading #containerDims (fed by the ResizeObserver) keeps this reactive to container
		// resizes; fall back to a direct measure before the observer's first callback.
		const size = container
			? (this.#containerDims ?? {
					w: container.getBoundingClientRect().width,
					h: container.getBoundingClientRect().height
				})
			: { w: this.#windowDims.w, h: this.#windowDims.h };

		if (isVertical(dir)) {
			const height = resolveLength(point, size.h);
			return { height, offset: dir === "bottom" ? size.h - height : -size.h + height };
		}
		const width = resolveLength(point, size.w);
		return { height: width, offset: dir === "right" ? size.w - width : -size.w + width };
	}

	/**
	 * Snap points paired with their rounded rest offset, **sorted least→most open**
	 * (so index 0 is the smallest and the last is the fullest, for any direction or
	 * unsorted input — fixes vaul #616). Rounding keeps resting transforms on the
	 * pixel grid so text doesn't blur (vaul-svelte #132).
	 */
	// Memoized via $derived: the map+sort — and the per-point getBoundingClientRect in
	// #resolve when a `container` is set — would otherwise re-run on *every* getter
	// access, and these are read many times per pointermove. Dependencies (snapPoints,
	// direction, container, window size) don't change mid-drag, so this computes once.
	#pairs = $derived.by(() => {
		const resolved = (this.#deps.snapPoints() ?? [])
			.map((point) => ({ point, ...this.#resolve(point) }))
			.sort((a, b) => a.height - b.height)
			.map(({ point, offset }) => ({ point, offset: Math.round(offset) }));
		// Collapse points that resolve to the same rest offset — keeping both would leave an
		// indistinguishable dead point that the offset-keyed lookups (findIndex, reduce) can't select.
		const deduped: { point: SnapPoint; offset: number }[] = [];
		for (const p of resolved) {
			if (deduped[deduped.length - 1]?.offset === p.offset) continue;
			deduped.push(p);
		}
		return deduped;
	});
	#arr: SnapPoint[] = $derived(this.#pairs.map((p) => p.point));
	#offsets: number[] = $derived(this.#pairs.map((p) => p.offset));

	get snapPointsArr(): SnapPoint[] {
		return this.#arr;
	}

	/** Index of the active point, or -1. */
	get activeSnapPointIndex(): number {
		return this.snapPointsArr.findIndex((p) => p === this.activeSnapPoint);
	}

	get isLastSnapPoint(): boolean {
		const sp = this.snapPointsArr;
		return sp.length > 0 && this.activeSnapPoint === sp[sp.length - 1];
	}

	/** Resolved fade-from index (default: last point). */
	get fadeFromIndex(): number {
		const f = this.#deps.fadeFromIndex();
		return f ?? Math.max(this.snapPointsArr.length - 1, 0);
	}

	get shouldFade(): boolean {
		const sp = this.snapPointsArr;
		if (sp.length === 0) return true;
		const f = this.#deps.fadeFromIndex() ?? sp.length - 1;
		return !Number.isNaN(f) && sp[f] === this.activeSnapPoint;
	}

	/** Pixel translate offset at which the drawer rests for each snap point. */
	get snapPointsOffset(): number[] {
		return this.#offsets;
	}

	get activeSnapPointOffset(): number | null {
		const idx = this.activeSnapPointIndex;
		return idx >= 0 ? (this.snapPointsOffset[idx] ?? null) : null;
	}

	/** Resting offset (px) for the active point — used for the `--svaul-drawer-snap-point-height` CSS var. */
	get snapPointHeight(): number {
		return this.activeSnapPointOffset ?? 0;
	}

	// ---------------------------------------------------------------- transforms
	#translate(dimension: number): string {
		return isVertical(this.#deps.direction())
			? `translate3d(0, ${dimension}px, 0)`
			: `translate3d(${dimension}px, 0, 0)`;
	}

	#applyTransform(dimension: number): void {
		const drawer = this.#deps.drawerEl();
		if (!drawer) return;
		const offsets = this.snapPointsOffset;
		const idx = offsets.findIndex((d) => d === dimension);
		const fadeFrom = this.fadeFromIndex;

		set(drawer, { transition: trans("transform"), transform: this.#translate(dimension) });

		const overlay = this.#deps.overlayEl();
		const hideOverlay =
			idx !== offsets.length - 1 && idx !== fadeFrom && idx < fadeFrom;
		set(overlay, { transition: trans("opacity"), opacity: hideOverlay ? "0" : "1" });
	}

	/** Animate to the point whose offset equals `dimension`, and mark it active. */
	snapToPoint(dimension: number): void {
		const idx = this.snapPointsOffset.findIndex((d) => d === dimension);
		this.#applyTransform(dimension);
		this.setActiveSnapPoint(this.snapPointsArr[Math.max(idx, 0)] ?? null);
	}

	/** Advance to the next (more-open) snap point. Returns false if already fullest. */
	cycleToNext(): boolean {
		const sp = this.snapPointsArr;
		if (sp.length === 0 || this.isLastSnapPoint) return false;
		const next = sp[this.activeSnapPointIndex + 1];
		if (next === undefined) return false;
		this.setActiveSnapPoint(next);
		return true;
	}

	/**
	 * Live follow during a drag (no transition). Clamps at the last/biggest point.
	 * Returns the translate offset (px) now applied, or `null` if there was nothing to
	 * do — the caller uses this for background scaling instead of reading it back out of
	 * the DOM (which would force a style recalc every pointermove).
	 */
	onDrag(draggedDistance: number): number | null {
		const offset = this.activeSnapPointOffset;
		if (offset === null) return null;
		const dir = this.#deps.direction();
		const offsets = this.snapPointsOffset;
		if (offsets.length === 0) return null; // no points to clamp against (removed mid-drag)
		const last = offsets[offsets.length - 1];

		const newValue =
			dir === "bottom" || dir === "right" ? offset - draggedDistance : offset + draggedDistance;

		// Don't exceed the biggest snap point — hold at `last` (the fullest rest offset).
		if ((dir === "bottom" || dir === "right") && newValue < last) return last;
		if ((dir === "top" || dir === "left") && newValue > last) return last;

		set(this.#deps.drawerEl(), { transform: this.#translate(newValue) });
		return newValue;
	}

	/** Decide which point to snap to on release (velocity fling / nearest / single-step). */
	onRelease(args: {
		draggedDistance: number;
		velocity: number;
		dismissible: boolean;
		closeDrawer: () => void;
	}): void {
		const { draggedDistance, velocity, dismissible, closeDrawer } = args;
		const dir = this.#deps.direction();
		const offsets = this.snapPointsOffset;
		const sp = this.snapPointsArr;
		// Snap points can be emptied reactively between the gesture start and release;
		// bail before the reduce() below (which throws on an empty array).
		if (offsets.length === 0) {
			if (dismissible) closeDrawer();
			return;
		}
		const seq = this.#deps.snapToSequentialPoint();
		const activeOffset = this.activeSnapPointOffset ?? 0;

		const currentPosition =
			dir === "bottom" || dir === "right"
				? activeOffset - draggedDistance
				: activeOffset + draggedDistance;
		const isFirst = this.activeSnapPointIndex === 0;
		const hasDraggedUp = draggedDistance > 0;

		// Velocity fling: skip straight to close / first / last.
		if (!seq && velocity > FLING_VELOCITY && !hasDraggedUp) {
			if (dismissible) closeDrawer();
			else this.snapToPoint(offsets[0]);
			return;
		}
		if (!seq && velocity > FLING_VELOCITY && hasDraggedUp) {
			this.snapToPoint(offsets[sp.length - 1]);
			return;
		}

		// Closest point to the released position.
		const closest = offsets.reduce((prev, curr) =>
			Math.abs(curr - currentPosition) < Math.abs(prev - currentPosition) ? curr : prev
		);

		// Measure the fling ratio against the container when offsets resolve against one.
		const rect = this.#deps.container()?.getBoundingClientRect();
		const dim = isVertical(dir)
			? (rect?.height ?? window.innerHeight)
			: (rect?.width ?? window.innerWidth);
		if (velocity > VELOCITY_THRESHOLD && Math.abs(draggedDistance) < dim * 0.4) {
			const dragDir = hasDraggedUp ? 1 : -1;
			if (dragDir > 0 && this.isLastSnapPoint) {
				this.snapToPoint(offsets[sp.length - 1]);
				return;
			}
			if (isFirst && dragDir < 0 && dismissible) {
				closeDrawer();
				return;
			}
			const idx = this.activeSnapPointIndex;
			const next = idx + dragDir;
			// Stepping past the first/last point yields no neighbour — fall back to nearest.
			const target = idx < 0 || next < 0 || next >= offsets.length ? undefined : offsets[next];
			this.snapToPoint(target ?? closest);
			return;
		}

		this.snapToPoint(closest);
	}

	/** Overlay opacity fraction while dragging across the fade boundary, or null. */
	getPercentageDragged(absDraggedDistance: number, isDraggingDown: boolean): number | null {
		const sp = this.snapPointsArr;
		const idx = this.activeSnapPointIndex;
		const offsets = this.snapPointsOffset;
		if (sp.length === 0 || idx < 0) return null;

		const fadeFrom = this.fadeFromIndex;
		const isOverlaySnapPoint = idx === fadeFrom - 1;
		const isOverlayOrHigher = idx >= fadeFrom;

		if (isOverlayOrHigher && isDraggingDown) return 0;
		if (isOverlaySnapPoint && !isDraggingDown) return 1;
		if (!this.shouldFade && !isOverlaySnapPoint) return null;

		const targetIdx = isOverlaySnapPoint ? idx + 1 : idx - 1;
		const distance = isOverlaySnapPoint
			? offsets[targetIdx] - offsets[targetIdx - 1]
			: offsets[targetIdx + 1] - offsets[targetIdx];

		// Guard against equal/edge offsets (would yield NaN/Infinity → "NaN" opacity).
		if (!Number.isFinite(distance) || distance === 0) return null;
		const pct = absDraggedDistance / Math.abs(distance);
		return isOverlaySnapPoint ? 1 - pct : pct;
	}
}
