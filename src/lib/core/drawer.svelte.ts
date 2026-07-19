import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { createAttachmentKey } from "svelte/attachments";
import {
	ATTR,
	CLOSE_THRESHOLD,
	DRAG_CLASS,
	JUST_RELEASED_TIMEOUT,
	NESTED_DISPLACEMENT,
	RELEASE,
	SWIPE_START_THRESHOLD_MOUSE,
	SWIPE_START_THRESHOLD_TOUCH,
	TRANSITION_EASE,
	TRANSITIONS,
	VELOCITY_THRESHOLD,
	WINDOW_TOP_OFFSET
} from "./constants.js";
import { directionMultiplier, getTranslate, isVertical, set } from "./dom.js";
import { isIOS } from "./browser.js";
import { dampenValue } from "../gestures/damping.js";
import { SnapPointsEngine } from "../snap/snap-points.svelte.js";
import { lockScroll } from "../a11y/scroll-lock.js";
import { trapFocus, getFocusable } from "../a11y/focus-trap.js";
import { pushEscape, isTopmost, closeAllDrawers } from "../a11y/dismiss.js";
import {
	acquireScale,
	scaleBackground as setScaleBackground,
	revertScaleBackground,
	type ScaleOptions
} from "../viewport/scale-background.js";
import { extract, isDefined, createId } from "./reactivity.svelte.js";
import type { DrawerDirection, MaybeGetter, Point, SnapPoint } from "./types.js";

export interface DrawerOptions {
	/**
	 * Controlled open state. Pass a getter (`() => open`) to control it; omit to let
	 * the drawer own its state internally (uncontrolled).
	 */
	open?: MaybeGetter<boolean | undefined>;
	/** Initial open state when uncontrolled. */
	defaultOpen?: boolean;
	/** Called whenever the drawer wants to change open state. */
	onOpenChange?: (open: boolean) => void;
	/** Called after the open/close animation has settled. */
	onOpenChangeComplete?: (open: boolean) => void;
	/** Edge the drawer slides in from. */
	direction?: MaybeGetter<DrawerDirection>;
	/** When false, the drawer can't be dismissed by drag, overlay click, or Escape. */
	dismissible?: MaybeGetter<boolean>;
	/** Modal (default) traps focus + locks scroll; non-modal leaves the page interactive. */
	modal?: MaybeGetter<boolean>;
	/** Base id for the content/title/description (pass an SSR-stable id, e.g. `$props.id()`). */
	id?: string;
	/** Accessible name when no `title` is provided (sets `aria-label`). */
	ariaLabel?: MaybeGetter<string | undefined>;
	/** Snap points — fractions in (0,1] or px strings (e.g. `[0.4, 1]` or `["180px", 1]`). */
	snapPoints?: MaybeGetter<SnapPoint[] | undefined>;
	/** Controlled active snap point (getter). Omit for uncontrolled. */
	activeSnapPoint?: MaybeGetter<SnapPoint | null | undefined>;
	/** Called when the active snap point changes. */
	onActiveSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	/** Index from which the overlay fades in. Defaults to the last snap point. */
	fadeFromIndex?: MaybeGetter<number | undefined>;
	/** Disable velocity-based snap-point skipping (always step one point at a time). */
	snapToSequentialPoint?: MaybeGetter<boolean | undefined>;
	/** Container used to size snap-point offsets (defaults to the viewport). */
	container?: MaybeGetter<HTMLElement | null | undefined>;
	/** Fraction of the drawer size that must be dragged past to close. Default 0.25. */
	closeThreshold?: MaybeGetter<number | undefined>;
	/**
	 * Multiplier mapping pointer movement to drawer movement. Default 1 (the drawer
	 * stays under your finger). Values > 1 make the drawer move faster than the cursor
	 * (e.g. 2 ≈ vaul-svelte's feel — easier to flick away).
	 */
	dragSensitivity?: MaybeGetter<number | undefined>;
	/** Only the handle initiates a drag (content body scrolls instead). */
	handleOnly?: MaybeGetter<boolean | undefined>;
	/** Only start a drag from the primary pointer/button (ignore right/middle click). */
	onlyPrimaryPointer?: MaybeGetter<boolean | undefined>;
	/** Move focus into the drawer on open. Default false (mobile-friendly). */
	autoFocus?: MaybeGetter<boolean | undefined>;
	/** Don't touch `<body>` styles (skip scroll-lock + background color). */
	noBodyStyles?: MaybeGetter<boolean | undefined>;
	/** Opt out of body scroll-locking while open. */
	disablePreventScroll?: MaybeGetter<boolean | undefined>;
	/** Scale `[data-svaul-drawer-wrapper]` behind the drawer (the iOS "card stack" look). */
	scaleBackground?: MaybeGetter<boolean | undefined>;
	/** Paint the body while the background is scaled. Default true. */
	setBackgroundColorOnScale?: MaybeGetter<boolean | undefined>;
	/** Body color used while the background is scaled. Default "black". */
	backgroundColor?: MaybeGetter<string | undefined>;
	/** Wrapper corner radius (px) while the background is scaled. Default 8. */
	borderRadius?: MaybeGetter<number | undefined>;
	/** Reposition focused inputs above the on-screen keyboard. Default true. */
	repositionInputs?: MaybeGetter<boolean | undefined>;
	/** Don't restore scroll position on close if the URL changed (SPA navigation). */
	preventScrollRestoration?: MaybeGetter<boolean | undefined>;
	/** Disable all enter/exit/drag transitions (instant open/close/snap). */
	disableAnimation?: MaybeGetter<boolean | undefined>;
	/** Per-move callback: `(event, percentageDragged)`. */
	onDrag?: (event: PointerEvent, percentageDragged: number) => void;
	/** On pointer release: `(event, open)` where `open` is the resulting state. */
	onRelease?: (event: PointerEvent | null, open: boolean) => void;
	/** Called when the drawer closes. */
	onClose?: () => void;
	/** Parent drawer (set automatically when nested) — receives the depth displacement. */
	parent?: Drawer | null;
}

const DURATION_MS = TRANSITIONS.DURATION * 1000;

/** Clamp `n` into `[lo, hi]`. */
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** Reactive set of currently-open drawers — lets each one compute its card-stack depth. */
const openDrawers = new SvelteSet<Drawer>();

/**
 * The reactive core of a drawer — the single source of truth shared (via context)
 * between the `<Drawer>` component's parts, and usable standalone as a headless API.
 *
 * Must be instantiated during component initialisation (e.g. in `<script>`), so its
 * internal `$effect`s can register. Spread its attribute bags (`.trigger`, `.content`,
 * `.overlay`, …) onto elements; each bag carries the data-attrs, ARIA, handlers, and a
 * ref-capturing attachment for that part.
 */
export class Drawer {
	// --- element refs (reactive: bags/derived can respond to mount/unmount) ---
	triggerEl = $state<HTMLElement | null>(null);
	contentEl = $state<HTMLElement | null>(null);
	overlayEl = $state<HTMLElement | null>(null);

	// --- a11y ids (derived from a caller-supplied, SSR-stable base when available) ---
	readonly contentId: string;
	readonly titleId: string;
	readonly descriptionId: string;

	/** Whether a `title`/`description` is present (set by the component for ARIA wiring). */
	hasTitle = $state(false);
	hasDescription = $state(false);

	hasBeenOpened = $state(false);

	// --- drag state ---
	/** True while a drag gesture is in progress. */
	isDragging = $state(false);
	/** Briefly true after a fast release, to suppress input auto-focus. */
	justReleased = $state(false);

	// Stable, idempotent iOS touchend handler (created once; never leaks per-press).
	#onTouchEnd = () => {
		this.#isAllowedToDrag = false;
	};
	#closeResetTimer: ReturnType<typeof setTimeout> | undefined;

	// --- velocity-throw close scratch ---
	/** Instantaneous release speed (px/ms) handed from onRelease to the close handler when the
	 *  close originated from a swipe. Null for non-gesture closes (overlay click, Escape,
	 *  programmatic) → those fall back to the default keyframe close. */
	#closeVelocity: number | null = null;
	/** True while an inline transform-transition close is animating (so a reopen can interrupt it). */
	#isFluidClosing = false;
	/** Last recorded drag sample `{pos, time}` along the axis, for instantaneous release velocity. */
	#lastSample: { pos: number; time: number } | null = null;
	/** Velocity (px/ms) between the two most recent drag samples — the release-velocity fallback. */
	#lastMoveVelocity = 0;

	// Non-reactive physics scratch (vaul's `useRef`s — must not trigger re-render).
	#pointerStart = 0; // position along the drag axis at press
	/** Close-progress (0=open … dimension=closed) where the drag was grabbed. Non-zero when the drawer
	 *  is caught mid-animation, so the drag continues from that point instead of jumping from 0. */
	#grabCloseProgress = 0;
	#pointerStartPoint: Point | null = null; // x/y at press (for swipe-intent)
	#wasBeyondThePoint = false;
	#lastPointerEvent: PointerEvent | null = null;
	#dragStartTime = 0;
	#dragEndTime = 0;
	#isAllowedToDrag = false;
	#activePointerId: number | null = null; // the finger that owns the current gesture
	#movedThisGesture = false; // distinguishes a handle tap from a handle drag
	#drawerHeight = 0;
	#drawerWidth = 0;
	#justReleasedTimer: ReturnType<typeof setTimeout> | undefined;

	#props: DrawerOptions;
	#internalOpen = $state(false);
	#present = $state(false);
	#transitionTimer: ReturnType<typeof setTimeout> | undefined;
	#snap: SnapPointsEngine;
	#parent: Drawer | null;
	#nestedTimer: ReturnType<typeof setTimeout> | undefined;
	/** Whether this drawer is currently displaced by a descendant (so we only touch its
	 *  transform once it has actually receded — never clobber its own open animation). */
	#wasReceded = false;

	// Stable ref attachments (created once → spread without re-running on every render).
	#triggerRef = this.#makeRef((el) => (this.triggerEl = el));
	#contentRef = {
		[createAttachmentKey()]: (node: Element) => {
			const el = node as HTMLElement;
			this.contentEl = el;
			// Claim the touch drag. Transforming the content under the finger during a touch drag makes
			// Chrome/Android drop the synthesized click on the NEXT tap (so a drawer swipe-dismiss left
			// the trigger needing a second tap). A non-passive `touchmove` preventDefault WHILE actively
			// dragging tells the browser we own the gesture, which stops it. Gated on the *committed*
			// drag (`#isAllowedToDrag`), never plain `isDragging`, so it never blocks scrolling inner
			// content. Must be a manual listener — Svelte's declarative `ontouchmove` is passive.
			const onTouchMove = (e: TouchEvent) => {
				if (this.#isAllowedToDrag) e.preventDefault();
			};
			el.addEventListener("touchmove", onTouchMove, { passive: false });
			// A fresh mount is a fresh open: animate the enter via a transform transition (not a CSS
			// keyframe) so the open is interruptible and nothing depends on keyframes.
			this.#fluidEnter(el);
			return () => {
				el.removeEventListener("touchmove", onTouchMove);
				this.contentEl = null;
			};
		}
	};
	#overlayRef = this.#makeRef((el) => (this.overlayEl = el));

	constructor(props: DrawerOptions = {}) {
		this.#props = props;
		this.#internalOpen = props.defaultOpen ?? false;
		this.#parent = props.parent ?? null;

		// Derive a11y ids from a caller-supplied base (SSR-stable) or a local counter.
		const base = props.id ?? createId("drawer");
		this.contentId = `${base}-content`;
		this.titleId = `${base}-title`;
		this.descriptionId = `${base}-description`;

		this.#snap = new SnapPointsEngine({
			snapPoints: () => extract(props.snapPoints, undefined),
			fadeFromIndex: () => extract(props.fadeFromIndex, undefined),
			direction: () => this.direction,
			container: () => extract(props.container, undefined),
			snapToSequentialPoint: () => extract(props.snapToSequentialPoint, false),
			activeSnapPoint: props.activeSnapPoint,
			onActiveSnapPointChange: props.onActiveSnapPointChange,
			drawerEl: () => this.contentEl,
			overlayEl: () => this.overlayEl
		});

		if (this.open) {
			this.#present = true;
			this.hasBeenOpened = true;
		}

		// Drive presence + transition timing off the resolved open state.
		$effect(() => {
			if (this.open) this.#handleOpen();
			else this.#handleClose();
		});

		// Lock body scroll while a modal drawer is open (ref-counted, reversible).
		$effect(() => {
			if (this.open && this.modal && !this.noBodyStyles && !this.disablePreventScroll) {
				return lockScroll({ preventScrollRestoration: this.preventScrollRestoration });
			}
		});

		// Focus + inert: make the rest of the page inert (so AT/keyboard can't escape
		// the modal), move focus into the dialog, trap Tab, and restore focus on close.
		$effect(() => {
			if (!this.open || !this.modal) return;
			const content = this.contentEl;
			if (!content || typeof document === "undefined") return;

			const previouslyFocused = document.activeElement as HTMLElement | null;

			// Mark every sibling of the drawer's portal root inert. The hasAttribute guard
			// keeps this safe across nested drawers (each only un-inerts what it set).
			const body = document.body;
			const portalRoot = Array.from(body.children).find((c) => c.contains(content));
			const inerted: HTMLElement[] = [];
			for (const child of Array.from(body.children)) {
				if (child === portalRoot || !(child instanceof HTMLElement)) continue;
				// Leave explicitly-ignored layers interactive — e.g. a popover/select that
				// portals its dropdown to <body> alongside (not inside) the drawer.
				if (child.matches(`[${ATTR.ignore}]`) || child.querySelector(`[${ATTR.ignore}]`))
					continue;
				if (!child.hasAttribute("inert")) {
					child.setAttribute("inert", "");
					inerted.push(child);
				}
			}

			// Move focus into the dialog. autoFocus → first focusable; otherwise the
			// container itself (announces the dialog without raising the mobile keyboard).
			const target = this.autoFocus ? (getFocusable(content)[0] ?? content) : content;
			target.focus({ preventScroll: true });

			const untrap = trapFocus(content);

			return () => {
				untrap();
				for (const el of inerted) el.removeAttribute("inert");
				// Restore focus to the trigger (or whatever had it), but only if it's still in the
				// document — focusing a detached node silently drops focus to <body>. Fall back to
				// the other candidate before giving up.
				const candidates = [this.triggerEl, previouslyFocused];
				const returnTo = candidates.find((el) => el?.isConnected);
				returnTo?.focus?.({ preventScroll: true });
			};
		});

		// Escape (+ outside-pointer for non-modal) closes the topmost dismissible drawer.
		$effect(() => {
			if (!this.open) return;
			const entry = { close: () => this.closeDrawer(), dismissible: () => this.dismissible };
			const cleanups = [pushEscape(entry)];

			// Non-modal drawers have no overlay to catch outside clicks, so do it here.
			if (!this.modal && typeof document !== "undefined") {
				const onDown = (event: PointerEvent) => {
					const content = this.contentEl;
					if (!content) return;
					// composedPath pierces shadow DOM; treat the drawer, its trigger, and any
					// [data-svaul-ignore] layer (e.g. a portaled popover) as "inside".
					for (const node of event.composedPath()) {
						if (node === content || node === this.triggerEl) return;
						if (node instanceof Element && node.closest(`[${ATTR.ignore}]`)) return;
					}
					if (this.dismissible && isTopmost(entry)) this.closeDrawer();
				};
				document.addEventListener("pointerdown", onDown, true);
				cleanups.push(() => document.removeEventListener("pointerdown", onDown, true));
			}

			return () => cleanups.forEach((fn) => fn());
		});

		// Background scaling (the iOS "card stack" look): apply on open, revert on close.
		// The initial progress is read untracked so this lifecycle effect doesn't re-run
		// (and flash a revert) every time the snap point changes.
		$effect(() => {
			if (!this.open || !this.scaleBackground || this.noBodyStyles) return;
			const animate = !this.disableAnimation;
			acquireScale(this.#scaleOpts({ animate }));
			setScaleBackground(untrack(() => this.#restScaleProgress()), this.#scaleOpts({ animate }));
			return () => revertScaleBackground(this.#scaleOpts({ animate: !this.disableAnimation }), this.noBodyStyles);
		});

		// Track the active snap point so the backdrop scales with how open the drawer is:
		// barely scaled at the smallest point, most scaled when fully open.
		$effect(() => {
			const offset = this.hasSnapPoints ? this.#snap.activeSnapPointOffset : null; // track
			if (offset == null) return;
			if (untrack(() => !this.open || !this.scaleBackground || this.noBodyStyles)) return;
			setScaleBackground(this.#restScaleProgress(), this.#scaleOpts({ animate: !this.disableAnimation }));
		});

		// Track this drawer in the open set while open, so ancestors can read their depth.
		$effect(() => {
			if (!this.open) return;
			openDrawers.add(this);
			return () => openDrawers.delete(this);
		});

		// Step this drawer back by however many open drawers are stacked above it (compounding).
		// Skip the initial at-rest state so we never override the drawer's own open animation.
		$effect(() => {
			const levels = this.#stackedAbove;
			if (!this.contentEl) return;
			if (levels === 0 && !this.#wasReceded) return;
			this.#wasReceded = levels > 0;
			this.#applyNestedRecede(levels);
		});

		// Lift a bottom drawer above the on-screen keyboard (mobile). Ports vaul's
		// `onVisualViewportChange`: it both *shrinks the drawer to the visible
		// viewport* (so its top edge stays put and the body becomes scrollable —
		// the browser then scrolls the focused field into view) and lifts the
		// bottom edge above the keyboard. Shifting `bottom` alone shoots the whole
		// drawer off the top of the screen (vaul #619).
		$effect(() => {
			if (!this.open || !this.repositionInputs || this.direction !== "bottom") return;
			if (typeof window === "undefined" || !window.visualViewport) return;
			const vv = window.visualViewport;

			// Per-open-session scratch (vaul's refs).
			let initialHeight = 0;
			let prevDiff = 0;
			let keyboardOpen = false;

			const onResize = () => {
				const content = this.contentEl;
				if (!content) return;

				const active = document.activeElement as HTMLElement | null;
				const isInput =
					!!active &&
					(active.tagName === "INPUT" ||
						active.tagName === "TEXTAREA" ||
						active.tagName === "SELECT" ||
						active.isContentEditable);
				// Only act while an input is focused (or while we know the keyboard is up).
				if (!isInput && !keyboardOpen) return;

				const vvHeight = vv.height;
				// iOS/WKWebView transiently reports height 0 mid-transition — ignore it.
				if (vvHeight === 0) return;
				const totalHeight = window.innerHeight;
				let diff = totalHeight - vvHeight; // keyboard height

				const rect = content.getBoundingClientRect();
				const drawerHeight = rect.height;
				const offsetTop = rect.top;
				const isTallEnough = drawerHeight > totalHeight * 0.8;
				if (!initialHeight) initialHeight = drawerHeight;

				// The keyboard height drifts a little while typing; a jump >60px is a
				// real open/close transition (vaul #56's debounce of the toggle).
				if (Math.abs(prevDiff - diff) > 60) keyboardOpen = !keyboardOpen;

				// With snap points the resting offset already pushes the drawer down,
				// so fold it into the keyboard gap.
				if (this.hasSnapPoints) diff += this.#snap.activeSnapPointOffset ?? 0;
				prevDiff = diff;

				if (drawerHeight > vvHeight) {
					// Taller than the visible viewport: shrink so the body scrolls and the
					// browser can bring the focused field into view.
					const newHeight = vvHeight - (isTallEnough ? offsetTop : WINDOW_TOP_OFFSET);
					content.style.height = `${Math.max(newHeight, vvHeight - offsetTop)}px`;
				} else {
					// Already fits above the keyboard — don't grow it (that would add empty
					// space); just lift it (below) and let the browser scroll the field in.
					content.style.height = `${initialHeight}px`;
				}

				if (this.hasSnapPoints && !keyboardOpen) {
					content.style.bottom = "0px";
				} else {
					content.style.bottom = `${Math.max(diff, 0)}px`;
				}
			};

			vv.addEventListener("resize", onResize);
			return () => {
				vv.removeEventListener("resize", onResize);
				if (this.contentEl) {
					this.contentEl.style.height = "";
					this.contentEl.style.bottom = "";
				}
			};
		});

		// Clean up any pending timer / listener on teardown.
		$effect(() => () => {
			if (this.#transitionTimer) clearTimeout(this.#transitionTimer);
			if (this.#justReleasedTimer) clearTimeout(this.#justReleasedTimer);
			if (this.#nestedTimer) clearTimeout(this.#nestedTimer);
			if (this.#closeResetTimer) clearTimeout(this.#closeResetTimer);
			if (typeof window !== "undefined") window.removeEventListener("touchend", this.#onTouchEnd);
		});
	}

	#makeRef(setEl: (el: HTMLElement | null) => void) {
		return {
			[createAttachmentKey()]: (node: Element) => {
				setEl(node as HTMLElement);
				return () => setEl(null);
			}
		};
	}

	// ---------------------------------------------------------------- open state
	get open(): boolean {
		if (isDefined(this.#props.open)) return extract(this.#props.open, false);
		return this.#internalOpen;
	}
	set open(value: boolean) {
		this.setOpen(value);
	}

	/** Request an open-state change (respects controlled vs uncontrolled). */
	setOpen(value: boolean): void {
		if (value === this.open) return;
		if (!isDefined(this.#props.open)) this.#internalOpen = value;
		this.#props.onOpenChange?.(value);
	}

	openDrawer(): void {
		this.setOpen(true);
	}

	/** Close the drawer. No-op when `dismissible` is false unless `force`. */
	closeDrawer(force = false): void {
		if (!this.dismissible && !force) return;
		this.#cancelDrag();
		this.#props.onClose?.();
		this.setOpen(false);

		// Reset to the first snap point once the close animation finishes (tracked so it
		// can't fire after unmount or stack up across rapid closes).
		if (this.hasSnapPoints && typeof setTimeout !== "undefined") {
			if (this.#closeResetTimer) clearTimeout(this.#closeResetTimer);
			this.#closeResetTimer = setTimeout(
				() => this.setActiveSnapPoint(this.snapPointsArr[0] ?? null),
				DURATION_MS
			);
		}
	}

	toggle(): void {
		this.setOpen(!this.open);
	}

	/** Advance to the next snap point (used by the handle tap). */
	cycleSnapPoint(): void {
		this.#snap.cycleToNext();
	}

	/** Close this drawer and every other open drawer in the stack. */
	closeAll(): void {
		closeAllDrawers();
	}

	// ---------------------------------------------------------------- derived
	/** Element stays mounted through the exit animation. Drive `{#if}` off this. */
	get present(): boolean {
		return this.#present;
	}

	/** `data-state` value driving the CSS enter/exit animations. */
	get state(): "open" | "closed" {
		return this.open ? "open" : "closed";
	}

	get direction(): DrawerDirection {
		return extract(this.#props.direction, "bottom");
	}
	get dismissible(): boolean {
		return extract(this.#props.dismissible, true);
	}
	get modal(): boolean {
		return extract(this.#props.modal, true);
	}
	get ariaLabel(): string | undefined {
		return extract(this.#props.ariaLabel, undefined);
	}
	get hasSnapPoints(): boolean {
		const sp = extract(this.#props.snapPoints, undefined);
		return Array.isArray(sp) && sp.length > 0;
	}
	/** Nesting depth (0 = root). Drives per-level z-index so a child overlays its parent. */
	get depth(): number {
		return this.#parent ? this.#parent.depth + 1 : 0;
	}

	/** How many open drawers are stacked above this one in its chain (0 = none). */
	get #stackedAbove(): number {
		let levels = 0;
		for (const d of openDrawers) {
			for (let a = d.#parent; a; a = a.#parent) {
				if (a === this) levels = Math.max(levels, d.depth - this.depth);
			}
		}
		return levels;
	}
	get dragSensitivity(): number {
		return extract(this.#props.dragSensitivity, 1);
	}
	get closeThreshold(): number {
		return extract(this.#props.closeThreshold, CLOSE_THRESHOLD);
	}
	get handleOnly(): boolean {
		return extract(this.#props.handleOnly, false);
	}
	get onlyPrimaryPointer(): boolean {
		return extract(this.#props.onlyPrimaryPointer, false);
	}
	get autoFocus(): boolean {
		return extract(this.#props.autoFocus, false);
	}
	get noBodyStyles(): boolean {
		return extract(this.#props.noBodyStyles, false);
	}
	get disablePreventScroll(): boolean {
		return extract(this.#props.disablePreventScroll, false);
	}
	get scaleBackground(): boolean {
		return extract(this.#props.scaleBackground, false);
	}
	get setBackgroundColorOnScale(): boolean {
		return extract(this.#props.setBackgroundColorOnScale, true);
	}
	get backgroundColor(): string {
		return extract(this.#props.backgroundColor, "black");
	}
	get borderRadius(): number {
		return extract(this.#props.borderRadius, 8);
	}
	get repositionInputs(): boolean {
		return extract(this.#props.repositionInputs, true);
	}
	get preventScrollRestoration(): boolean {
		return extract(this.#props.preventScrollRestoration, false);
	}
	get disableAnimation(): boolean {
		return extract(this.#props.disableAnimation, false);
	}

	// ---- snap points (delegated to the engine) ----
	get activeSnapPoint(): SnapPoint | null {
		return this.#snap.activeSnapPoint;
	}
	set activeSnapPoint(value: SnapPoint | null) {
		this.#snap.setActiveSnapPoint(value);
	}
	setActiveSnapPoint(value: SnapPoint | null): void {
		this.#snap.setActiveSnapPoint(value);
	}
	get activeSnapPointIndex(): number {
		return this.#snap.activeSnapPointIndex;
	}
	get isLastSnapPoint(): boolean {
		return this.#snap.isLastSnapPoint;
	}
	get shouldFade(): boolean {
		return this.hasSnapPoints ? this.#snap.shouldFade : true;
	}
	get snapPointsArr(): SnapPoint[] {
		return this.#snap.snapPointsArr;
	}

	// ---------------------------------------------------------------- transitions
	#handleOpen(): void {
		if (this.#transitionTimer) {
			clearTimeout(this.#transitionTimer);
			this.#transitionTimer = undefined;
		}
		// A reopen within the close window must cancel the pending snap-reset, or it would yank
		// the freshly-opened drawer down to its first snap point with no input.
		if (this.#closeResetTimer) {
			clearTimeout(this.#closeResetTimer);
			this.#closeResetTimer = undefined;
		}
		// A stale close-velocity from a blocked/aborted close must never leak into the next close.
		this.#closeVelocity = null;
		// Interrupt: a reopen landed while a throw close was still animating. Glide back to open
		// from wherever the drawer currently is — a live transition reverses from the current
		// computed transform, so this is continuous (no keyframe restart, no waiting out the exit).
		if (this.#isFluidClosing && this.contentEl) {
			this.#isFluidClosing = false;
			this.hasBeenOpened = true;
			this.#present = true;
			const duration = this.#reopenDuration();
			set(this.contentEl, {
				animationName: "none",
				transform: this.#translate(0),
				transition: `transform ${duration}ms ${TRANSITION_EASE}`
			});
			set(this.overlayEl, {
				animationName: "none",
				opacity: "1",
				transition: `opacity ${duration}ms ${TRANSITION_EASE}`
			});
			// Keep `animation-name:none` inline after the glide settles. Clearing it would revert to
			// the CSS-driven state and, since data-state is still "open", RE-FIRE the enter keyframe —
			// replaying the open from the bottom (a visible glitch). All motion is transition-driven now.
			this.#afterTransition(() => this.#props.onOpenChangeComplete?.(true), duration);
			return;
		}
		this.#isFluidClosing = false;
		// A drag-close leaves an inline transform + `transition: none` on the content (and a
		// faded opacity on the overlay). Reopening within the exit window — or every reopen
		// with `keepMounted` — would replay the enter keyframe and then, since keyframe fill is
		// `none`, snap back to that stuck mid-drag frame. Wipe it so we start from the clean
		// CSS enter state. No-op when no drag styles were written.
		this.#clearDragStyles();
		this.hasBeenOpened = true;
		this.#present = true;
		this.#afterTransition(() => this.#props.onOpenChangeComplete?.(true));
	}

	/** Remove any inline transform/opacity/transition a drag (or fluid close) left behind,
	 *  reverting to the CSS-driven state — including `animationName` so the enter keyframe
	 *  can play again after a fluid-close cycle. */
	#clearDragStyles(): void {
		if (this.contentEl) set(this.contentEl, { transform: "", transition: "", animationName: "" }, true);
		if (this.overlayEl) set(this.overlayEl, { opacity: "", transition: "", animationName: "" }, true);
	}

	#handleClose(): void {
		if (!this.#present) return;
		// Drive every close through the inline transform transition (not the CSS exit keyframe) so the
		// motion stays interruptible mid-flight — a reopen reverses continuously from the live position
		// (see #handleOpen). A swipe release scales the duration by velocity; overlay/Escape/programmatic
		// closes have none and use the default. Snap drawers + disableAnimation keep the classic path.
		const useTransition = !this.hasSnapPoints && !this.disableAnimation;
		const duration = useTransition ? this.#fluidClose() : DURATION_MS;
		this.#closeVelocity = null;
		this.#afterTransition(() => {
			this.#isFluidClosing = false;
			this.#present = false;
			this.#props.onOpenChangeComplete?.(false);
		}, duration);
	}

	#afterTransition(cb: () => void, ms: number = DURATION_MS): void {
		if (this.#transitionTimer) clearTimeout(this.#transitionTimer);
		// No animation → mount/unmount immediately instead of waiting out the transition.
		if (this.disableAnimation) {
			cb();
			return;
		}
		if (typeof setTimeout === "undefined") return;
		this.#transitionTimer = setTimeout(cb, ms);
	}

	// ---------------------------------------------------------------- velocity-throw close
	// The swipe-release close (and its interruptible reopen): the close duration is scaled by the
	// release velocity, and the exit is an inline transform transition (not the CSS keyframe) so a
	// reopen can reverse it mid-flight.

	/** The drawer's live size along the drag axis (px). */
	#axisDimension(): number {
		const content = this.contentEl;
		if (!content) return 0;
		return isVertical(this.direction) ? content.offsetHeight : content.offsetWidth;
	}

	/**
	 * Release-duration model: clamp the physical `remaining / velocity` time (distance ÷ speed),
	 * re-normalize it onto a 0.1–1 scalar, and multiply by the base — so a hard flick ≈ 40ms and a
	 * gentle throw ≈ 400ms. Returns the applied transition duration (ms).
	 */
	#throwDuration(remaining: number, velocity: number): number {
		const v = Math.abs(velocity);
		if (!v) return DURATION_MS;
		const clampedV = clamp(v, RELEASE.MIN_VELOCITY, RELEASE.MAX_VELOCITY);
		const durationMs = clamp(remaining / clampedV, RELEASE.MIN_DURATION_MS, RELEASE.MAX_DURATION_MS);
		const normalized = (durationMs - RELEASE.MIN_DURATION_MS) / (RELEASE.MAX_DURATION_MS - RELEASE.MIN_DURATION_MS);
		const scalar = clamp(
			RELEASE.MIN_SCALAR + normalized * (RELEASE.MAX_SCALAR - RELEASE.MIN_SCALAR),
			RELEASE.MIN_SCALAR,
			RELEASE.MAX_SCALAR
		);
		return scalar * RELEASE.BASE_MS;
	}

	/** Duration for gliding a partially-closed drawer back open — proportional to how far it still
	 *  has to travel, so a barely-closed drawer snaps open and a mostly-closed one eases. */
	#reopenDuration(): number {
		const dimension = this.#axisDimension();
		const current = this.contentEl ? Math.abs(getTranslate(this.contentEl, this.direction) ?? 0) : 0;
		const frac = dimension > 0 ? current / dimension : 1;
		return clamp(DURATION_MS * frac, RELEASE.MIN_DURATION_MS, DURATION_MS);
	}

	/**
	 * Animate the exit via an inline transform transition instead of the CSS exit keyframe.
	 *
	 * The transition would otherwise NOT animate from an at-rest drawer: reading the transform
	 * (via `getTranslate`) forces a style flush that starts the `[data-state="closed"]` fill-forwards
	 * exit keyframe, poisoning the transition's "from" value so it jumps straight to closed. So we
	 * (1) pin the current offset with `transition:none` + `animation:none`, (2) force a reflow to
	 * commit that as the transition's start frame, then (3) write the target + timed transition.
	 * Returns the chosen duration so the caller can time the unmount to match.
	 */
	#fluidClose(): number {
		const content = this.contentEl;
		if (!content) return DURATION_MS;

		const dirMul = directionMultiplier(this.direction);
		const dimension = this.#axisDimension();
		const current = getTranslate(content, this.direction) ?? 0;
		const remaining = Math.max(dimension - Math.abs(current), 0);
		const duration = this.#throwDuration(remaining, this.#closeVelocity ?? 0);

		const overlay = this.overlayEl;
		const overlayOpacity = overlay ? getComputedStyle(overlay).opacity : "1";

		this.#isFluidClosing = true;
		// 1. Pin the current position; kill the exit keyframe and any transition.
		set(content, { animationName: "none", transition: "none", transform: this.#translate(current) });
		if (overlay) set(overlay, { animationName: "none", transition: "none", opacity: overlayOpacity }, true);
		// 2. Force a reflow so the pinned values become the transition's committed start frame.
		void content.offsetHeight;
		// 3. Animate to fully closed.
		set(content, {
			transform: this.#translate(dimension * dirMul),
			transition: `transform ${duration}ms ${TRANSITION_EASE}`
		});
		if (overlay) set(overlay, { opacity: "0", transition: `opacity ${duration}ms ${TRANSITION_EASE}` }, true);
		return duration;
	}

	/**
	 * Fresh open: animate the content (and overlay) IN via a transform/opacity transition instead of
	 * a CSS enter keyframe, so the open is interruptible and nothing depends on keyframes. Same
	 * pin → reflow → transition dance as #fluidClose, in reverse. Snap drawers (which rest at a CSS
	 * offset) and `disableAnimation` are skipped — they keep their instant/CSS positioning.
	 */
	#fluidEnter(el: HTMLElement): void {
		if (!this.open || this.hasSnapPoints || this.disableAnimation) return;
		const dirMul = directionMultiplier(this.direction);
		const dimension = isVertical(this.direction) ? el.offsetHeight : el.offsetWidth;
		const overlay = this.overlayEl;
		const ease = `${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`;
		// 1. Pin fully closed, kill any keyframe, no transition.
		set(el, { animationName: "none", transition: "none", transform: this.#translate(dimension * dirMul) });
		if (overlay && this.shouldFade) set(overlay, { animationName: "none", transition: "none", opacity: "0" }, true);
		// 2. Reflow commits the closed frame as the transition's start.
		void el.offsetHeight;
		// 3. Transition to open.
		set(el, { transform: this.#translate(0), transition: `transform ${ease}` });
		if (overlay && this.shouldFade) set(overlay, { opacity: "1", transition: `opacity ${ease}` }, true);
	}
	// -------------------------------------------------------------- end velocity-throw close

	/** Record one drag sample and update the running per-move velocity. */
	#recordSample(pos: number, time: number): void {
		const last = this.#lastSample;
		if (last && time > last.time) {
			const dt = Math.max(time - last.time, RELEASE.SAMPLE_MIN_DT_MS);
			this.#lastMoveVelocity = (pos - last.pos) / dt;
		}
		this.#lastSample = { pos, time };
	}

	/**
	 * Instantaneous release speed (px/ms), magnitude only. Derived from the final ≤ SAMPLE_MAX_AGE_MS
	 * of motion (so a slow drag ending in a flick reads fast), falling back to the last per-move
	 * velocity when the final sample is stale (finger paused before releasing).
	 */
	#releaseVelocity(pos: number, time: number): number {
		const last = this.#lastSample;
		if (last && time >= last.time && time - last.time <= RELEASE.SAMPLE_MAX_AGE_MS) {
			const dt = Math.max(time - last.time, RELEASE.SAMPLE_MIN_DT_MS);
			const v = (pos - last.pos) / dt;
			if (v !== 0) return Math.abs(v);
		}
		return Math.abs(this.#lastMoveVelocity);
	}

	// ---------------------------------------------------------------- drag physics
	#axis(event: PointerEvent): number {
		return isVertical(this.direction) ? event.pageY : event.pageX;
	}

	#translate(px: number): string {
		return isVertical(this.direction)
			? `translate3d(0, ${px}px, 0)`
			: `translate3d(${px}px, 0, 0)`;
	}

	// ---- background-scale helpers ----
	#viewportDim(): number {
		if (typeof window === "undefined") return 0;
		return isVertical(this.direction) ? window.innerHeight : window.innerWidth;
	}

	/** Scale progress (0 = fully open, 1 = closed) for a given translate offset. */
	#scaleProgressFor(offset: number): number {
		const dim = this.#viewportDim();
		return dim > 0 ? Math.min(Math.abs(offset) / dim, 1) : 0;
	}

	/** Resting scale progress: snap drawers rest partially open; otherwise fully open (0). */
	#restScaleProgress(): number {
		if (!this.hasSnapPoints) return 0;
		return this.#scaleProgressFor(this.#snap.activeSnapPointOffset ?? 0);
	}

	#scaleOpts(extra: { animate: boolean }): ScaleOptions {
		return {
			id: this.contentId,
			depth: this.depth,
			direction: this.direction,
			setBackgroundColorOnScale: this.setBackgroundColorOnScale,
			noBodyStyles: this.noBodyStyles,
			backgroundColor: this.backgroundColor,
			borderRadius: this.borderRadius,
			...extra
		};
	}

	/** pointerdown — begin tracking a potential drag. */
	onPress(event: PointerEvent): void {
		if (!this.dismissible && !this.hasSnapPoints) return;
		// Ignore a second finger landing mid-drag — otherwise it resets the gesture origin and
		// teleports the drawer (and can turn a slow drag into a flick-close).
		if (this.isDragging) return;
		// Ignore non-primary buttons (right/middle click) when opted in.
		if (this.onlyPrimaryPointer && event.button !== 0) return;
		const content = this.contentEl;
		if (!content) return;
		if (event.target instanceof Node && !content.contains(event.target)) return;

		this.#activePointerId = event.pointerId;

		const rect = content.getBoundingClientRect();
		this.#drawerHeight = rect.height;
		this.#drawerWidth = rect.width;
		this.isDragging = true;
		this.#movedThisGesture = false;
		this.#dragStartTime = Date.now();
		this.#pointerStartPoint = { x: event.pageX, y: event.pageY };
		this.#wasBeyondThePoint = false;

		// iOS doesn't fire pointerup after a scroll, so cancel the drag on touchend.
		// A stable, de-duped handler (removed on release/teardown) avoids leaking a
		// listener per press when no touchend ever fires (mouse/stylus/cancel on iPad).
		if (isIOS()) {
			window.removeEventListener("touchend", this.#onTouchEnd);
			window.addEventListener("touchend", this.#onTouchEnd, { once: true });
		}
		// Keep receiving moves even when the pointer leaves the drawer.
		(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
		this.#pointerStart = this.#axis(event);
		// Seed the velocity sampler at the press point.
		this.#lastSample = { pos: this.#pointerStart, time: this.#dragStartTime };
		this.#lastMoveVelocity = 0;
	}

	/** pointermove — gate on swipe intent, then drag. */
	onPointerMove(event: PointerEvent): void {
		// Ignore moves from any finger other than the one that started the gesture. Touch-event
		// fallbacks come through with no pointerId, so only filter real, mismatched PointerEvents.
		if (
			typeof event.pointerId === "number" &&
			this.#activePointerId !== null &&
			event.pointerId !== this.#activePointerId
		)
			return;
		this.#lastPointerEvent = event;
		const start = this.#pointerStartPoint;
		if (!start) return;

		const delta: Point = { x: event.pageX - start.x, y: event.pageY - start.y };
		const threshold =
			event.pointerType === "touch" ? SWIPE_START_THRESHOLD_TOUCH : SWIPE_START_THRESHOLD_MOUSE;

		if (this.#isDeltaInDirection(delta, threshold)) {
			this.onDrag(event);
		} else if (Math.abs(delta.x) > threshold || Math.abs(delta.y) > threshold) {
			// Committed to the wrong axis — this is a scroll, abandon the gesture.
			this.#pointerStartPoint = null;
		}
	}

	/** Whether `delta` is along the drawer's drag axis (ported from vaul). */
	#isDeltaInDirection(delta: Point, threshold: number): boolean {
		if (this.#wasBeyondThePoint) return true;
		const deltaY = Math.abs(delta.y);
		const deltaX = Math.abs(delta.x);
		const isDeltaX = deltaX > deltaY;
		const dFactor = this.direction === "bottom" || this.direction === "right" ? 1 : -1;

		if (this.direction === "left" || this.direction === "right") {
			const isReverse = delta.x * dFactor < 0;
			if (!isReverse && deltaX >= 0 && deltaX <= threshold) return isDeltaX;
		} else {
			const isReverse = delta.y * dFactor < 0;
			if (!isReverse && deltaY >= 0 && deltaY <= threshold) return !isDeltaX;
		}

		this.#wasBeyondThePoint = true;
		return true;
	}

	/** Map the current pointer position to a live transform. */
	onDrag(event: PointerEvent): void {
		const content = this.contentEl;
		if (!content || !this.isDragging) return;

		const hasSnap = this.hasSnapPoints;
		const dirMul = directionMultiplier(this.direction);
		const draggedDistance = (this.#pointerStart - this.#axis(event)) * dirMul * this.dragSensitivity;
		const isDraggingInDir = draggedDistance > 0;
		const absDragged = Math.abs(draggedDistance);
		const dimension = isVertical(this.direction) ? this.#drawerHeight : this.#drawerWidth;
		let percentageDragged = dimension > 0 ? absDragged / dimension : 0;

		// Block closing past the smallest snap point when non-dismissible.
		const noCloseSnap = hasSnap && !this.dismissible && !isDraggingInDir;
		if (noCloseSnap && this.activeSnapPointIndex === 0) return;

		const snapPct = hasSnap ? this.#snap.getPercentageDragged(absDragged, isDraggingInDir) : null;
		if (snapPct !== null) percentageDragged = snapPct;

		if (noCloseSnap && percentageDragged >= 1) return;

		// Once shouldDrag approves a gesture it stays approved until release.
		if (!this.#isAllowedToDrag && !this.#shouldDrag(event.target, isDraggingInDir)) return;
		const firstMove = !this.#movedThisGesture;
		content.classList.add(DRAG_CLASS);
		this.#isAllowedToDrag = true;
		this.#movedThisGesture = true;
		// Sample the axis position for instantaneous release-velocity measurement.
		this.#recordSample(this.#axis(event), Date.now());

		// Kill transitions for the duration of the drag — only needs doing once. For a non-snap drawer,
		// also catch it where it currently is: pin the live offset (so removing the transition doesn't
		// snap it to the target) and remember that offset so the drag continues from the grab point.
		// Zero for a normal at-rest drag; snap drawers track their own offset via the engine.
		if (firstMove) {
			const grab = hasSnap ? 0 : (getTranslate(content, this.direction) ?? 0);
			this.#grabCloseProgress = grab * dirMul;
			set(content, hasSnap ? { transition: "none" } : { transform: this.#translate(grab), transition: "none" });
			set(this.overlayEl, { transition: "none" });
		}

		const snapOffset = hasSnap ? this.#snap.onDrag(draggedDistance) : null;

		// Non-snap: resolve the target offset relative to the grab point. `closeProgress` is 0 at
		// fully-open and `dimension` at closed; dragging past fully-open (negative) rubber-bands.
		// percentageDragged is re-derived from the true position so the overlay/scale/nested track it.
		let dragPx = 0;
		if (!hasSnap) {
			const closeProgress = this.#grabCloseProgress - draggedDistance;
			dragPx = closeProgress < 0 ? -dampenValue(-closeProgress) * dirMul : closeProgress * dirMul;
			percentageDragged = dimension > 0 ? Math.max(closeProgress, 0) / dimension : 0;
		}

		// Fade the overlay across the fade boundary (always, when no snap points).
		const atFadeBoundary = this.activeSnapPointIndex === this.#snap.fadeFromIndex - 1;
		if (this.shouldFade || atFadeBoundary) {
			this.#props.onDrag?.(event, percentageDragged);
			if (this.overlayEl) {
				set(this.overlayEl, { opacity: String(1 - percentageDragged), transition: "none" }, true);
			}
		}

		// Live background scaling tracks the finger. For snap drawers the scale tracks
		// the drawer's live offset (how open it is), not the overlay-fade percentage —
		// taken from snap.onDrag's return value rather than reading the DOM transform.
		if (this.scaleBackground && !this.noBodyStyles && !(hasSnap && snapOffset === null)) {
			const progress = hasSnap
				? this.#scaleProgressFor(snapOffset ?? 0)
				: percentageDragged;
			setScaleBackground(progress, this.#scaleOpts({ animate: false }));
		}

		// Displace the parent drawer (if nested) in step with this drag.
		this.#parent?.onNestedDrag(percentageDragged);

		// Follow the finger toward the closed position (snap engine handles its own transform).
		if (!hasSnap) set(content, { transform: this.#translate(dragPx) });
	}

	/** pointerup / pointercancel — decide close vs reset from distance + velocity. */
	onRelease(event: PointerEvent | null): void {
		this.#pointerStartPoint = null;
		this.#wasBeyondThePoint = false;

		if (!this.isDragging) return;
		// Clear drag state up-front so it can never get stuck `true` if the content unmounted
		// mid-drag (which would otherwise let a later handleOnly hover apply a stray transform).
		// Capture whether a drag was actually approved this gesture before we reset the flag.
		const engaged = this.#isAllowedToDrag;
		this.isDragging = false;
		this.#isAllowedToDrag = false;
		this.#activePointerId = null;
		this.#dragEndTime = Date.now();

		const content = this.contentEl;
		if (!content) return;
		content.classList.remove(DRAG_CLASS);

		const swipeAmount = getTranslate(content, this.direction);
		if (!event || !this.#shouldDrag(event.target, false) || !swipeAmount || Number.isNaN(swipeAmount))
			return;
		if (!this.#dragStartTime) return;

		// Velocity is the *instantaneous* release speed from the last ≤80ms of real finger movement —
		// not an average over the whole gesture, so a slow drag ending in a flick still reads fast.
		// Only the displacement fed to the position/threshold logic is amplified by dragSensitivity
		// (so a high sensitivity moves the drawer further without collapsing thresholds).
		const rawDist = this.#pointerStart - this.#axis(event);
		const distMoved = rawDist * this.dragSensitivity;
		const velocity = this.#releaseVelocity(this.#axis(event), this.#dragEndTime);

		if (velocity > 0.05) {
			this.justReleased = true;
			if (this.#justReleasedTimer) clearTimeout(this.#justReleasedTimer);
			this.#justReleasedTimer = setTimeout(() => (this.justReleased = false), JUST_RELEASED_TIMEOUT);
		}

		// Snap-point drawers delegate the release decision to the engine.
		if (this.hasSnapPoints) {
			// A gesture that was never approved as a drag (e.g. an abandoned cross-axis flick on
			// an inner carousel) must not run the snap math — the drawer's resting offset makes
			// swipeAmount non-zero, so it would otherwise jump snap points from incidental drift.
			if (!engaged) {
				this.#props.onRelease?.(event, this.open);
				return;
			}
			const dirMul = directionMultiplier(this.direction);
			let closed = false;
			this.#snap.onRelease({
				draggedDistance: distMoved * dirMul,
				velocity,
				dismissible: this.dismissible,
				closeDrawer: () => {
					closed = true;
					this.closeDrawer();
				}
			});
			// Report the real resulting state, not an unconditional `true` (a flick-dismiss closes).
			this.#props.onRelease?.(event, !closed);
			return;
		}

		// Released while still dragging in the open direction → snap back open.
		const movedOpenward =
			this.direction === "bottom" || this.direction === "right" ? distMoved > 0 : distMoved < 0;
		if (movedOpenward) {
			this.#resetDrawer();
			this.#props.onRelease?.(event, true);
			return;
		}

		// Fast flick → close. Arm the velocity throw (release speed always clears the throw floor here).
		if (velocity > VELOCITY_THRESHOLD) {
			this.#closeVelocity = velocity;
			this.closeDrawer();
			this.#props.onRelease?.(event, false);
			return;
		}

		// Past the close threshold → close. Arm the throw only if there's still enough release speed
		// to warrant it (above the MIN_VELOCITY floor); a dead-slow drag past the threshold closes
		// with the default keyframe instead.
		const rect = content.getBoundingClientRect();
		const visibleH = Math.min(rect.height, window.innerHeight);
		const visibleW = Math.min(rect.width, window.innerWidth);
		const horizontal = this.direction === "left" || this.direction === "right";
		if (Math.abs(swipeAmount) >= (horizontal ? visibleW : visibleH) * this.closeThreshold) {
			if (velocity > RELEASE.MIN_VELOCITY) this.#closeVelocity = velocity;
			this.closeDrawer();
			this.#props.onRelease?.(event, false);
			return;
		}

		this.#props.onRelease?.(event, true);
		this.#resetDrawer();
	}

	/** Animate the drawer back to its fully-open resting position. */
	#resetDrawer(): void {
		const content = this.contentEl;
		if (!content) return;
		set(content, {
			transform: this.#translate(0),
			transition: `transform ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`
		});
		set(this.overlayEl, {
			transition: `opacity ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`,
			opacity: "1"
		});
		// Restore the scaled background to fully-open (reset is non-snap only).
		if (this.scaleBackground && !this.noBodyStyles) {
			setScaleBackground(0, this.#scaleOpts({ animate: true }));
		}
		// If this is a nested drawer that stayed open, restore the parent's displacement.
		this.#parent?.onNestedRelease(true);
	}

	#cancelDrag(): void {
		if (!this.isDragging || !this.contentEl) return;
		this.contentEl.classList.remove(DRAG_CLASS);
		this.#isAllowedToDrag = false;
		this.isDragging = false;
		this.#dragEndTime = Date.now();
	}

	/**
	 * Scroll-vs-drag gate (adapted from vaul's `shouldDrag`, minus the time-based locks). The
	 * decision is purely structural — there is NO post-open timer and no post-scroll debounce: a drag
	 * starts immediately unless the pointer is over something that can still scroll toward the close
	 * edge.
	 */
	#shouldDrag(target: EventTarget | null, isDraggingInDirection: boolean): boolean {
		let element = target as HTMLElement | null;
		if (!element) return true;

		const highlightedText = window.getSelection()?.toString();
		const swipeAmount = this.contentEl ? getTranslate(this.contentEl, this.direction) : null;

		if (element.tagName === "SELECT") return false;
		if (element.hasAttribute?.(ATTR.noDrag) || element.closest?.(`[${ATTR.noDrag}]`)) return false;
		// Horizontal drawers: vaul returned true here unconditionally, so a horizontally
		// scrollable child (carousel, wide code block) could never scroll and, once scrolled,
		// could never be swiped closed. Climb for a scroller that can still move toward the
		// close edge; otherwise drag.
		if (this.direction === "right" || this.direction === "left") return this.#climbAllowsDrag(target);

		// Already mid-drag in the open direction → keep dragging.
		if (swipeAmount !== null) {
			if (this.direction === "bottom" ? swipeAmount > 0 : swipeAmount < 0) return true;
		}

		if (highlightedText && highlightedText.length > 0) return false;

		// Dragging further past fully-open (overdrag) isn't a dismiss gesture — let it scroll.
		if (isDraggingInDirection) return false;

		return this.#climbAllowsDrag(target);
	}

	/**
	 * Climb from the pointer target up to the drawer surface. If any element on the way can
	 * still scroll *toward the close edge*, let it scroll (return false) instead of dragging.
	 * Stop at the drawer itself — page-level scroll ancestors behind the drawer are irrelevant.
	 */
	#climbAllowsDrag(target: EventTarget | null): boolean {
		let element = target as HTMLElement | null;
		while (element) {
			if (this.#canScrollInCloseDir(element)) return false;
			if (element === this.contentEl || element.getAttribute?.("role") === "dialog") return true;
			element = element.parentNode as HTMLElement | null;
		}
		return true;
	}

	/**
	 * Whether `el` can still scroll in the direction the close gesture would move it — i.e. the
	 * gesture should scroll it rather than drag the drawer. Direction-aware: a bottom drawer
	 * closes downward (drag only at scrollTop 0), a top drawer upward (drag only at the bottom
	 * edge), and left/right use the horizontal edges. `EDGE` absorbs sub-pixel rounding.
	 *
	 * The overflow check matters for the far-edge directions (top/left): a non-scrollable
	 * element (overflow: visible) whose children overflow still reports `scrollX + clientX <
	 * scrollWidth`, which would falsely block the drag on every side/top drawer. `scrollTop`/
	 * `scrollLeft > 0` is self-validating for bottom/right, but we check overflow uniformly.
	 */
	#canScrollInCloseDir(el: HTMLElement): boolean {
		const EDGE = 1;
		switch (this.direction) {
			case "bottom":
				if (!(el.scrollHeight > el.clientHeight && el.scrollTop > 0)) return false;
				return this.#scrollableInAxis(el, "y");
			case "top":
				if (!(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - EDGE))
					return false;
				return this.#scrollableInAxis(el, "y");
			case "right":
				if (!(el.scrollWidth > el.clientWidth && el.scrollLeft > 0)) return false;
				return this.#scrollableInAxis(el, "x");
			case "left":
				if (!(el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE))
					return false;
				return this.#scrollableInAxis(el, "x");
		}
	}

	/** Whether `el`'s computed overflow on `axis` actually permits scrolling (auto/scroll/overlay). */
	#scrollableInAxis(el: HTMLElement, axis: "x" | "y"): boolean {
		const overflow = getComputedStyle(el)[axis === "y" ? "overflowY" : "overflowX"];
		return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
	}

	// ---------------------------------------------------------------- nested drawers
	#scaleTransform(scale: number, translate: number): string {
		return isVertical(this.direction)
			? `scale(${scale}) translate3d(0, ${translate}px, 0)`
			: `scale(${scale}) translate3d(${translate}px, 0, 0)`;
	}

	/** Step this drawer back by `levels` stacked descendants (0 = at rest). Each level
	 *  compounds, so deeper ancestors recede further than nearer ones. */
	#applyNestedRecede(levels: number): void {
		const content = this.contentEl;
		if (!content) return;
		if (this.#nestedTimer) clearTimeout(this.#nestedTimer);

		const w = window.innerWidth;
		const scale = levels > 0 ? (w - NESTED_DISPLACEMENT * levels) / w : 1;
		const translate = levels > 0 ? -NESTED_DISPLACEMENT * levels : 0;
		set(content, {
			transition: `transform ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`,
			transform: this.#scaleTransform(scale, translate)
		});

		// Back at rest: pin the drawer's own transform so it doesn't fight its snap/drag value.
		if (levels === 0) {
			this.#nestedTimer = setTimeout(() => {
				const t = getTranslate(content, this.direction);
				set(content, { transition: "none", transform: this.#translate(t ?? 0) });
			}, DURATION_MS);
		}
	}

	/** Called on the parent as a child drawer is dragged (`percentageDragged` 0→1). */
	onNestedDrag(percentageDragged: number): void {
		if (percentageDragged < 0) return;
		const content = this.contentEl;
		if (!content) return;
		const initialScale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
		const scale = initialScale + percentageDragged * (1 - initialScale);
		const translate = -NESTED_DISPLACEMENT + percentageDragged * NESTED_DISPLACEMENT;
		set(content, { transition: "none", transform: this.#scaleTransform(scale, translate) });
	}

	/** Called on the parent when a child drag releases and the child stays open. */
	onNestedRelease(childOpen: boolean): void {
		const content = this.contentEl;
		if (!content || !childOpen) return;
		const scale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
		set(content, {
			transition: `transform ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`,
			transform: this.#scaleTransform(scale, -NESTED_DISPLACEMENT)
		});
	}

	// ---------------------------------------------------------------- attribute bags
	// Stable handler identities (arrow fields, bound once) so spreading a bag onto an
	// element doesn't tear down and re-add its event listeners on every re-render.
	#onTriggerClick = () => this.toggle();
	#onContentPointerDown = (event: PointerEvent) => {
		if (this.handleOnly) return;
		this.onPress(event);
	};
	#onContentPointerMove = (event: PointerEvent) => {
		if (this.handleOnly) return;
		this.onPointerMove(event);
	};
	#onContentRelease = (event: PointerEvent) => this.onRelease(event);
	// The browser fires `pointercancel` the moment it claims a touch gesture for native
	// scrolling of a scrollable descendant — which is exactly when the finger is at the
	// scroll-top edge and continuing into a drag-to-close. Treating that as a release
	// aborts the drag. For touch we ignore it and keep driving the gesture through the
	// touch-event fallback below (mirrors vaul-svelte, which never binds pointercancel);
	// mouse/pen never scroll-cancel this way, so they keep the normal release behaviour.
	#onContentPointerCancel = (event: PointerEvent) => {
		if (event.pointerType === "touch") return;
		this.onRelease(event);
	};
	// Touch fallback: after a pointercancel the pointer-event stream stops, but touch
	// events keep flowing, so the drag can still complete. TouchEvent isn't a PointerEvent,
	// so adapt it to the shape onPointerMove/onRelease read (pageX/pageY/pointerType/target).
	#toPointerish(event: TouchEvent, useChanged = false): PointerEvent {
		const list = useChanged ? event.changedTouches : event.touches;
		const t = list[0] ?? event.changedTouches[0];
		return new Proxy(event as unknown as PointerEvent, {
			get(target, prop) {
				if (prop === "pageX") return t?.pageX ?? 0;
				if (prop === "pageY") return t?.pageY ?? 0;
				if (prop === "pointerType") return "touch";
				const value = (target as unknown as Record<string | symbol, unknown>)[prop];
				return typeof value === "function" ? value.bind(target) : value;
			}
		});
	}
	#onContentTouchMove = (event: TouchEvent) => {
		if (this.handleOnly) return;
		this.onPointerMove(this.#toPointerish(event));
	};
	#onContentTouchEnd = (event: TouchEvent) => this.onRelease(this.#toPointerish(event, true));
	// A system gesture (incoming call, notification-shade pull, edge back-swipe) fires
	// touchcancel and ends the touch stream — with pointercancel ignored for touch, nothing
	// else would settle the drag, leaving the drawer frozen mid-offset (drag class +
	// transition:none stuck, isDragging true). Settle it from the last known position.
	#onContentTouchCancel = () => {
		if (this.isDragging) this.onRelease(this.#lastPointerEvent);
	};
	#onContentContextMenu = () => {
		// Right-click during a drag fires contextmenu instead of pointerup, so end the drag.
		// But only while actually dragging — otherwise an Android long-press with no movement
		// would replay a *previous* gesture's stale coordinates and snap/close a stationary drawer.
		if (this.isDragging && this.#lastPointerEvent) this.onRelease(this.#lastPointerEvent);
	};
	#onOverlayClick = (event: MouseEvent) => {
		event.stopPropagation();
		this.closeDrawer();
	};
	#onCloseClick = () => this.closeDrawer(true);
	#onHandlePointerDown = (event: PointerEvent) => {
		if (this.handleOnly) this.onPress(event);
	};
	#onHandlePointerMove = (event: PointerEvent) => {
		if (this.handleOnly) this.onDrag(event);
	};
	#onHandleClick = () => {
		// A drag through the handle shouldn't also trigger a tap-cycle.
		if (this.#movedThisGesture) return;
		// Tapping the handle only cycles snap points. It must never close a
		// non-dismissible drawer (that's the whole point of `dismissible={false}`).
		if (this.hasSnapPoints) {
			if (this.isLastSnapPoint && this.dismissible) this.closeDrawer();
			else this.cycleSnapPoint();
		}
	};

	get trigger() {
		return {
			...this.#triggerRef,
			"aria-haspopup": "dialog",
			"aria-expanded": this.open,
			"aria-controls": this.present ? this.contentId : undefined,
			[`${ATTR.drawer}-trigger`]: "",
			onclick: this.#onTriggerClick
		};
	}

	get content() {
		return {
			...this.#contentRef,
			id: this.contentId,
			role: "dialog",
			"aria-modal": this.modal ? ("true" as const) : undefined,
			"aria-labelledby": this.hasTitle ? this.titleId : undefined,
			"aria-label": !this.hasTitle ? this.ariaLabel : undefined,
			"aria-describedby": this.hasDescription ? this.descriptionId : undefined,
			tabindex: -1,
			[ATTR.drawer]: "",
			[ATTR.direction]: this.direction,
			[ATTR.snapPoints]: String(this.open && this.hasSnapPoints),
			[ATTR.noAnimate]: this.disableAnimation ? "" : undefined,
			"data-state": this.state,
			style:
				`--svaul-drawer-depth: ${this.depth};` +
				(this.hasSnapPoints ? ` --svaul-drawer-snap-point-height: ${this.#snap.snapPointHeight}px;` : ""),
			onpointerdown: this.#onContentPointerDown,
			onpointermove: this.#onContentPointerMove,
			onpointerup: this.#onContentRelease,
			onpointercancel: this.#onContentPointerCancel,
			ontouchmove: this.#onContentTouchMove,
			ontouchend: this.#onContentTouchEnd,
			ontouchcancel: this.#onContentTouchCancel,
			oncontextmenu: this.#onContentContextMenu
		};
	}

	get overlay() {
		return {
			...this.#overlayRef,
			[ATTR.overlay]: "",
			[ATTR.snapPoints]: String(this.hasSnapPoints),
			[ATTR.snapPointsOverlay]: String(this.shouldFade),
			[ATTR.noAnimate]: this.disableAnimation ? "" : undefined,
			"data-state": this.state,
			"aria-hidden": true,
			style: `--svaul-drawer-depth: ${this.depth};`,
			onclick: this.#onOverlayClick
		};
	}

	get close() {
		return {
			[`${ATTR.drawer}-close`]: "",
			onclick: this.#onCloseClick
		};
	}

	get title() {
		return { id: this.titleId };
	}

	get description() {
		return { id: this.descriptionId };
	}

	/** Handle (grabber) bag. Initiates drag in `handleOnly` mode; tap cycles snap points. */
	get handle() {
		return {
			[ATTR.handle]: "",
			"aria-hidden": true,
			onpointerdown: this.#onHandlePointerDown,
			onpointermove: this.#onHandlePointerMove,
			onclick: this.#onHandleClick
		};
	}
}
