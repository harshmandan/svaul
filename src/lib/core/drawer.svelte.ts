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
	DIRECTION_COMMIT_PX,
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

// Ref-counted `inert` shared across ALL drawer instances, so stacked modals cooperate: closing an
// earlier modal must not un-inert the page behind a later one. We only touch elements svaul owns —
// an element a consumer inerted itself (present in the map's absence) is left alone.
const inertCounts = new WeakMap<Element, number>();
function acquireInert(el: Element): void {
	const owned = inertCounts.has(el);
	if (el.hasAttribute("inert") && !owned) return; // a consumer owns this inert — don't manage it
	const next = (inertCounts.get(el) ?? 0) + 1;
	inertCounts.set(el, next);
	if (next === 1) el.setAttribute("inert", "");
}
function releaseInert(el: Element): void {
	const count = inertCounts.get(el);
	if (count === undefined) return; // not svaul-owned
	if (count > 1) {
		inertCounts.set(el, count - 1);
		return;
	}
	inertCounts.delete(el);
	el.removeAttribute("inert");
}
/** Inert everything except the ancestor path from `content` up to `<body>` — so the modal (whether
 *  portalled to body or rendered inline) is the only interactive region. The drawer's own `overlay`
 *  (a sibling of the content) is kept interactive so click-to-close still works. Returns a cleanup. */
function inertOutside(content: HTMLElement, overlay: HTMLElement | null, ignoreAttr: string): () => void {
	const inerted: HTMLElement[] = [];
	let node: HTMLElement | null = content;
	while (node && node !== document.body) {
		const parentEl: HTMLElement | null = node.parentElement;
		if (!parentEl) break;
		for (const sib of Array.from(parentEl.children)) {
			if (sib === node || !(sib instanceof HTMLElement)) continue;
			if (overlay && (sib === overlay || sib.contains(overlay))) continue; // the drawer's overlay
			// Leave explicitly-ignored layers interactive (e.g. a popover/select portalled to <body>).
			if (sib.matches(`[${ignoreAttr}]`) || sib.querySelector(`[${ignoreAttr}]`)) continue;
			acquireInert(sib);
			inerted.push(sib);
		}
		node = parentEl;
	}
	return () => {
		for (const el of inerted) releaseInert(el);
	};
}

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
	 *  programmatic) → those use the default close duration. */
	#closeVelocity: number | null = null;
	/** The drawer's offset (px) at the moment of a swipe release, captured before the swiping state is
	 *  dropped — feeds the throw's remaining-distance math (which #handleClose can no longer read live). */
	#closeFromPx = 0;
	/** True for the first painted frame after a fresh mount: holds the content at the closed offset
	 *  (via `data-svaul-drawer-starting`) so the transform transition plays IN when it's removed. */
	#starting = $state(false);
	/** True while a non-snap drag is in progress (adds `data-svaul-drawer-swiping`): the CSS follows
	 *  the live `--svaul-drawer-swipe`/`--svaul-drawer-swipe-progress` variables with the transition
	 *  frozen, so the drawer tracks the finger 1:1. Dropped on release → CSS transitions to the target. */
	#swiping = $state(false);
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
	#pointerCancelled = false; // touch: pointer stream died (pointercancel) → touch events drive the drag
	#scrolledBeforeDrag = false; // the gesture scrolled inner content before the drawer drag committed
	#dragStartTime = 0;
	#dragEndTime = 0;
	#isAllowedToDrag = false;
	#activePointerId: number | null = null; // the finger that owns the current gesture
	#movedThisGesture = false; // distinguishes a handle tap from a handle drag
	#pressStartedInsideContent = false; // gates the modal backdrop against inside-started drags
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

			// Inert everything except the path to the drawer (ref-counted so stacked modals cooperate,
			// and walking up from the content so it also works for an inline / non-portalled modal).
			const uninert = inertOutside(content, this.overlayEl, ATTR.ignore);

			// Move focus into the dialog on open — but only if it isn't already inside (this effect can
			// re-run when a reactive dep changes while open, and re-focusing would yank focus back from
			// wherever the user navigated). autoFocus → first focusable; otherwise the container itself.
			if (!content.contains(document.activeElement)) {
				const target = this.autoFocus ? (getFocusable(content)[0] ?? content) : content;
				target.focus({ preventScroll: true });
			}

			const untrap = trapFocus(content);

			return () => {
				untrap();
				uninert();
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

			// One capture-phase pointerdown listener records where each click sequence *starts* (so the
			// modal backdrop can ignore a drag that began inside the drawer) and, for non-modal drawers
			// which have no overlay, doubles as the outside-press dismissal.
			if (typeof document !== "undefined") {
				const onDown = (event: PointerEvent) => {
					const content = this.contentEl;
					const path = event.composedPath();
					// composedPath pierces shadow DOM. Remember whether the press began inside the drawer.
					this.#pressStartedInsideContent = !!content && path.includes(content);
					if (this.modal) return;
					// Non-modal outside-press dismissal: primary button only (a right/middle click must
					// not close), and treat the drawer, its trigger, and any [data-svaul-ignore] layer
					// (e.g. a portaled popover) as "inside".
					if (event.button !== 0) return;
					if (!content) return;
					for (const node of path) {
						if (node === content || node === this.triggerEl) return;
						if (node instanceof Element && node.closest(`[${ATTR.ignore}]`)) return;
					}
					if (!(this.dismissible && isTopmost(entry))) return;
					// Mouse/pen dismiss on press. For touch, wait for a stationary release — a press that
					// was the start of a page scroll must not dismiss the drawer on finger-down.
					if (event.pointerType !== "touch") {
						this.closeDrawer();
						return;
					}
					const startX = event.clientX;
					const startY = event.clientY;
					const onUp = (up: PointerEvent) => {
						document.removeEventListener("pointerup", onUp, true);
						document.removeEventListener("pointercancel", onUp, true);
						if (up.type === "pointerup" && Math.hypot(up.clientX - startX, up.clientY - startY) < 10)
							this.closeDrawer();
					};
					document.addEventListener("pointerup", onUp, true);
					document.addEventListener("pointercancel", onUp, true);
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
			return () => revertScaleBackground(this.#scaleOpts({ animate: !this.disableAnimation }));
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
	// Open/close is a CSS transform (+ overlay opacity) transition selected by data attributes, not by
	// JS setting transforms every frame:
	//  · `data-state` ("open" | "closed", from the `state` getter) picks open (translate 0) vs closed.
	//  · `data-svaul-drawer-starting` holds the content at the closed offset for the first painted
	//    frame after mount; removing it releases the transition IN. See the CSS.
	// JS only toggles those attributes, times the unmount, and — for a velocity release — shortens the
	// close via the `--svaul-drawer-duration` variable. Interrupting a close is free: reopening flips
	// data-state back to "open" and the live transition reverses from the current position.
	#handleOpen(): void {
		if (this.#transitionTimer) {
			clearTimeout(this.#transitionTimer);
			this.#transitionTimer = undefined;
		}
		// A reopen within the close window must cancel the pending snap-reset, or it would yank the
		// freshly-opened drawer down to its first snap point with no input.
		if (this.#closeResetTimer) {
			clearTimeout(this.#closeResetTimer);
			this.#closeResetTimer = undefined;
		}
		this.#closeVelocity = null;
		const fresh = !this.#present;
		this.hasBeenOpened = true;
		this.#present = true;
		// Clear any per-close duration override + inline drag styles so the CSS transition drives the
		// open. No-op on a fresh mount (contentEl isn't attached yet); on a reopen mid-close it lets
		// data-state="open" reverse the drawer from its current position.
		this.#resetInline();
		if (fresh) {
			// Mount at the closed offset (starting attribute), then release to open on the next painted
			// frame → the transition plays IN. Skipped on a reopen-mid-close so it doesn't jump closed.
			this.#starting = true;
			if (typeof requestAnimationFrame !== "undefined") {
				requestAnimationFrame(() => requestAnimationFrame(() => (this.#starting = false)));
			} else {
				this.#starting = false;
			}
		}
		this.#afterTransition(() => this.#props.onOpenChangeComplete?.(true));
	}

	#handleClose(): void {
		if (!this.#present) return;
		// A programmatic/controlled close can arrive mid-drag (parent flips `open` while the finger is
		// down). Clear the drag first so #swiping/#isAllowedToDrag/isDragging don't stick and the swipe
		// variables aren't zeroed while the frozen swiping rule is still applied (which would snap the
		// drawer to open instead of animating closed).
		if (this.isDragging) this.#cancelDrag();
		const content = this.contentEl;
		const overlay = this.overlayEl;
		// A velocity release shortens the close via the duration variable (non-snap only). The `state`
		// getter has already flipped data-state to "closed", so the CSS closed rule + transition drive
		// the exit from the live position; overlay/Escape/programmatic closes just use the default.
		let ms = DURATION_MS;
		if (this.#closeVelocity != null && !this.hasSnapPoints && !this.disableAnimation && content) {
			// Use the release offset captured in onRelease — by now the swiping state is gone and the
			// content is already transitioning toward closed, so a live read wouldn't be the grab point.
			const current = Math.abs(this.#closeFromPx);
			ms = this.#throwDuration(Math.max(this.#axisDimension() - current, 0), this.#closeVelocity);
			set(content, { "--svaul-drawer-duration": `${ms}ms` });
			set(overlay, { "--svaul-drawer-duration": `${ms}ms` }, true);
		}
		this.#closeVelocity = null;
		// A snap drag leaves an inline transform (+ transition:none); a non-snap swipe leaves the swipe
		// variables. Clear both so the CSS closed transform + transition drive the exit from the live
		// position. A non-drag close has nothing to clear.
		if (content)
			set(content, { transform: "", transition: "", "--svaul-drawer-swipe": "" }, true);
		if (overlay) set(overlay, { opacity: "", transition: "", "--svaul-drawer-swipe-progress": "" }, true);
		this.#afterTransition(() => {
			this.#present = false;
			this.#props.onOpenChangeComplete?.(false);
		}, ms);
	}

	/** Clear inline transform/opacity/transition + the per-close duration override so the CSS
	 *  transition drives the motion purely from the data attributes. */
	#resetInline(): void {
		if (this.contentEl)
			set(
				this.contentEl,
				{ transform: "", transition: "", "--svaul-drawer-duration": "", "--svaul-drawer-swipe": "" },
				true
			);
		if (this.overlayEl)
			set(
				this.overlayEl,
				{ opacity: "", transition: "", "--svaul-drawer-duration": "", "--svaul-drawer-swipe-progress": "" },
				true
			);
	}

	#afterTransition(cb: () => void, ms: number = DURATION_MS): void {
		if (this.#transitionTimer) clearTimeout(this.#transitionTimer);
		// No animation → mount/unmount immediately instead of waiting out the transition. Reduced-motion
		// collapses the CSS transition to ~0 (see the media query in the stylesheet), so hold the
		// present-state for the same instant instead of a stale DURATION_MS — otherwise the overlay and
		// content linger on screen for half a second after an effectively-instant close.
		if (this.disableAnimation || this.#prefersReducedMotion()) {
			cb();
			return;
		}
		if (typeof setTimeout === "undefined") return;
		this.#transitionTimer = setTimeout(cb, ms);
	}

	#prefersReducedMotion(): boolean {
		return (
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		);
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

	// ---------------------------------------------------------- end velocity-throw close

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
	 * Instantaneous release velocity (px/ms) along the drag axis, **signed** in raw axis coordinates
	 * (down/right positive). Derived from the final ≤ SAMPLE_MAX_AGE_MS of motion (so a slow drag
	 * ending in a flick reads fast), falling back to the last per-move velocity when the final sample
	 * is stale (finger paused before releasing). Callers take `Math.abs` for speed and use the sign
	 * for the flick *direction* (which can differ from the net drag direction).
	 */
	#releaseVelocity(pos: number, time: number): number {
		const last = this.#lastSample;
		if (last && time >= last.time && time - last.time <= RELEASE.SAMPLE_MAX_AGE_MS) {
			const dt = Math.max(time - last.time, RELEASE.SAMPLE_MIN_DT_MS);
			const v = (pos - last.pos) / dt;
			if (v !== 0) return v;
		}
		return this.#lastMoveVelocity;
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

		// Catching a still-present, closing drawer reopens it: this cancels the pending unmount timer
		// (via #handleOpen) so the content can't unmount mid-drag, and lets the user drag it back from
		// its live position instead of it sliding out from under the finger.
		if (this.#present && !this.open) this.setOpen(true);

		this.#activePointerId = event.pointerId;

		const rect = content.getBoundingClientRect();
		this.#drawerHeight = rect.height;
		this.#drawerWidth = rect.width;
		this.isDragging = true;
		this.#movedThisGesture = false;
		this.#pointerCancelled = false;
		this.#scrolledBeforeDrag = false;
		// Cancel a pending nested-recede re-pin (scheduled when this drawer returned to rest) so it can't
		// fire mid-gesture and stomp the live drag transform.
		if (this.#nestedTimer) clearTimeout(this.#nestedTimer);
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
		// Remember the live event for settlers (contextmenu/touchcancel). onPointerMove sets this too,
		// but handle-only drags drive onDrag directly and would otherwise settle from a stale event.
		this.#lastPointerEvent = event;

		const hasSnap = this.hasSnapPoints;
		const dirMul = directionMultiplier(this.direction);
		let draggedDistance = (this.#pointerStart - this.#axis(event)) * dirMul * this.dragSensitivity;
		const isDraggingInDir = draggedDistance > 0;
		let absDragged = Math.abs(draggedDistance);
		const dimension = isVertical(this.direction) ? this.#drawerHeight : this.#drawerWidth;
		let percentageDragged = dimension > 0 ? absDragged / dimension : 0;

		// Block closing past the smallest snap point when non-dismissible.
		const noCloseSnap = hasSnap && !this.dismissible && !isDraggingInDir;
		if (noCloseSnap && this.activeSnapPointIndex === 0) return;

		const snapPct = hasSnap ? this.#snap.getPercentageDragged(absDragged, isDraggingInDir) : null;
		if (snapPct !== null) percentageDragged = snapPct;

		if (noCloseSnap && percentageDragged >= 1) return;

		// Don't decide scroll-vs-drag until the gesture has a clear direction. Real touch fires an
		// initial move at the exact press point (≈ 0 travel); deciding then reads `inDir` as false and —
		// over content that can't scroll toward the close edge (e.g. an inner box at scrollTop 0) —
		// latches a drawer drag before the finger has actually moved, hijacking what was meant to be an
		// upward content scroll. Gate on the RAW finger travel (not the sensitivity-amplified value) so a
		// high `dragSensitivity` doesn't shrink the commit window back toward zero.
		const rawTravel = Math.abs(this.#pointerStart - this.#axis(event));
		if (!this.#isAllowedToDrag && rawTravel < DIRECTION_COMMIT_PX) return;
		// Once shouldDrag approves a gesture it stays approved until release. A rejection here means the
		// gesture is (so far) scrolling inner content — remember that so the eventual drag re-anchors.
		if (!this.#isAllowedToDrag && !this.#shouldDrag(event.target, isDraggingInDir)) {
			this.#scrolledBeforeDrag = true;
			return;
		}
		const firstMove = !this.#movedThisGesture;
		content.classList.add(DRAG_CLASS);
		this.#isAllowedToDrag = true;
		this.#movedThisGesture = true;
		// Sample the axis position for instantaneous release-velocity measurement.
		this.#recordSample(this.#axis(event), Date.now());

		// First move: freeze the transition and, for a non-snap drawer, hand the drag to the CSS
		// variables via `data-svaul-drawer-swiping`. Remember the grab offset (the drawer's live
		// position) so the drag continues from that point — this is what makes a drawer caught
		// mid-animation follow the finger from where it was, not jump from 0. Snap drawers keep the
		// engine's own inline transform, so only freeze their transition here.
		if (firstMove) {
			// If the gesture scrolled inner content before the drag engaged, re-anchor the origin to the
			// commit point — otherwise that scrolled distance stays baked into draggedDistance and
			// teleports the drawer on the first drag frame. A normal drag (no prior scroll) keeps its
			// origin at the press point so displacement/sensitivity stay measured from there.
			if (this.#scrolledBeforeDrag) {
				this.#pointerStart = this.#axis(event);
				draggedDistance = 0;
				absDragged = 0;
				if (!hasSnap) percentageDragged = 0;
			}
			if (hasSnap) {
				set(content, { transition: "none" });
				set(this.overlayEl, { transition: "none" });
			} else {
				this.#grabCloseProgress = (getTranslate(content, this.direction) ?? 0) * dirMul;
				this.#swiping = true;
			}
		}

		const snapOffset = hasSnap ? this.#snap.onDrag(draggedDistance) : null;

		// Non-snap: resolve the target offset relative to the grab point. `closeProgress` is 0 at
		// fully-open and `dimension` at closed; dragging past fully-open (negative) rubber-bands.
		// percentageDragged is re-derived from the true position so the overlay/scale/nested track it.
		let dragPx = 0;
		if (!hasSnap) {
			const closeProgress = this.#grabCloseProgress - draggedDistance;
			// Past fully-open (negative) rubber-bands. Clamp the damped value to the open direction so it
			// eases smoothly from 0 — without the clamp, `dampenValue`'s offset produces a ~16px jump in
			// the *closing* direction the instant the drawer crosses past its resting position.
			dragPx =
				closeProgress < 0
					? Math.min(-dampenValue(-closeProgress), 0) * dirMul
					: closeProgress * dirMul;
			percentageDragged = dimension > 0 ? Math.max(closeProgress, 0) / dimension : 0;
		}

		// Fade the overlay across the fade boundary (always, when no snap points).
		const atFadeBoundary = this.activeSnapPointIndex === this.#snap.fadeFromIndex - 1;
		if (this.shouldFade || atFadeBoundary) {
			this.#props.onDrag?.(event, percentageDragged);
			if (this.overlayEl) {
				// Non-snap fades via the progress variable (data-svaul-drawer-swiping applies it); snap
				// keeps its own inline opacity.
				if (hasSnap) set(this.overlayEl, { opacity: String(1 - percentageDragged), transition: "none" }, true);
				else set(this.overlayEl, { "--svaul-drawer-swipe-progress": String(1 - percentageDragged) }, true);
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

		// Follow the finger via the CSS variable (snap engine handles its own inline transform).
		if (!hasSnap) set(content, { "--svaul-drawer-swipe": `${dragPx}px` }, true);
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
		// Drop the swiping state so the CSS transition takes back over toward the data-state target
		// (open on a snap-back, closed on a dismiss). Must happen even on the early returns below.
		this.#swiping = false;

		const content = this.contentEl;
		if (!content) return;
		content.classList.remove(DRAG_CLASS);

		// Read while the swiping state is still applied to the DOM (the #swiping = false above only takes
		// effect on the next flush), so this is the true live offset — remember it for the throw math.
		const swipeAmount = getTranslate(content, this.direction);
		this.#closeFromPx = swipeAmount ?? 0;
		if (!event || !this.#shouldDrag(event.target, false) || !swipeAmount || Number.isNaN(swipeAmount))
			return;
		if (!this.#dragStartTime) return;

		// Velocity is the *instantaneous* release speed from the last ≤80ms of real finger movement —
		// not an average over the whole gesture, so a slow drag ending in a flick still reads fast.
		// Only the displacement fed to the position/threshold logic is amplified by dragSensitivity
		// (so a high sensitivity moves the drawer further without collapsing thresholds).
		const rawDist = this.#pointerStart - this.#axis(event);
		const distMoved = rawDist * this.dragSensitivity;
		const signedVelocity = this.#releaseVelocity(this.#axis(event), this.#dragEndTime);
		const velocity = Math.abs(signedVelocity);

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
			// Flick direction in the engine's draggedDistance convention (+1 = toward more-open / "up").
			// The release *flick* can oppose the net drag (drag up, flick down); the engine only flings
			// when this agrees with the net drag, so a reversing flick no longer throws the wrong way.
			const flickDir = Math.sign(-signedVelocity * dirMul);
			let closed = false;
			this.#snap.onRelease({
				draggedDistance: distMoved * dirMul,
				velocity,
				flickDir,
				closeThreshold: this.closeThreshold,
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

		// Whether the release *flick* points toward the close edge (down for bottom, up for top, …).
		// `signedVelocity` is the raw axis velocity; multiplying by the direction sign normalizes it so
		// > 0 means close-ward for every direction. A reversing flick (drag down, flick back up) must NOT
		// count as a fast close, and must not arm a throw with its wrong-direction speed.
		const flickToClose = signedVelocity * directionMultiplier(this.direction) > 0;

		// Fast flick toward the close edge → close. Arm the velocity throw.
		if (velocity > VELOCITY_THRESHOLD && flickToClose) {
			this.#closeVelocity = velocity;
			this.closeDrawer();
			this.#props.onRelease?.(event, false);
			return;
		}

		// Past the close threshold → close. Arm the throw only if there's still enough close-ward release
		// speed to warrant it (above the MIN_VELOCITY floor); otherwise it closes with the default duration.
		const rect = content.getBoundingClientRect();
		const visibleH = Math.min(rect.height, window.innerHeight);
		const visibleW = Math.min(rect.width, window.innerWidth);
		const horizontal = this.direction === "left" || this.direction === "right";
		if (Math.abs(swipeAmount) >= (horizontal ? visibleW : visibleH) * this.closeThreshold) {
			if (flickToClose && velocity > RELEASE.MIN_VELOCITY) this.#closeVelocity = velocity;
			this.closeDrawer();
			this.#props.onRelease?.(event, false);
			return;
		}

		this.#props.onRelease?.(event, true);
		this.#resetDrawer();
	}

	/** Animate the drawer back to its fully-open resting position after a released-but-not-dismissed
	 *  drag. Dropping the swiping state (in onRelease) hands control back to the CSS transition, which
	 *  eases the drawer from its live position to open (data-state="open" → translate 0). */
	#resetDrawer(): void {
		const content = this.contentEl;
		if (!content) return;
		// Do NOT clear --svaul-drawer-swipe / -swipe-progress here: onRelease has set #swiping = false,
		// but the `data-svaul-drawer-swiping` attribute is only removed on the next flush, so zeroing the
		// variables now — while the frozen (0s) swiping rule is still applied — snaps the drawer straight
		// to open instead of transitioning. The variables are stale-but-unused once the attribute drops,
		// and get overwritten by the next drag or cleared on reopen (#resetInline). Only the per-close
		// duration override needs clearing so the default duration animates the snap-back.
		set(content, { transform: "", transition: "", "--svaul-drawer-duration": "" }, true);
		set(this.overlayEl, { opacity: "", transition: "", "--svaul-drawer-duration": "" }, true);
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
		this.#swiping = false;
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
		// A range slider is dragged along its own axis; a drawer drag must never hijack it.
		if (element.closest?.('input[type="range"]')) return false;
		if (element.hasAttribute?.(ATTR.noDrag) || element.closest?.(`[${ATTR.noDrag}]`)) return false;
		// Horizontal drawers: climb for a scroller that can still move toward the close edge; else drag.
		if (this.direction === "right" || this.direction === "left") return this.#climbAllowsDrag(target);

		// A drawer displaced toward its close edge is mid-flight → keep dragging it (catches a closing
		// drawer; lets a snap drawer at a partial point be re-dragged). For a snap drawer, measure the
		// ACTIVE snap offset (its rest target) rather than the live transform — so a scroll during the
		// open-to-full-point transition isn't hijacked by the sliding-in residual. For a non-snap drawer,
		// only while it is CLOSING (its opening transition's residual must not read as an in-progress drag).
		const displaced = this.hasSnapPoints
			? (this.#snap.activeSnapPointOffset ?? 0)
			: this.state === "closed"
				? (swipeAmount ?? 0)
				: 0;
		if (this.direction === "bottom" ? displaced > 0 : displaced < 0) return true;

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
		let node = target as Node | null;
		while (node) {
			if (node instanceof HTMLElement) {
				if (this.#canScrollInCloseDir(node)) return false;
				if (node === this.contentEl || node.getAttribute("role") === "dialog") return true;
			}
			// Cross shadow boundaries so a scroller inside a web component is still detected: stepping
			// off a shadow root jumps to its host rather than dead-ending at the fragment.
			node = node instanceof ShadowRoot ? node.host : node.parentNode;
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

	/** Publish the recede as CSS variables (+ the `data-svaul-drawer-nested` attribute) so the
	 *  stylesheet composes it with the drawer's data-state transform — non-snap drawers only. */
	#setNestedVars(content: HTMLElement, scale: number, translate: number, animate: boolean): void {
		content.setAttribute(ATTR.nested, "");
		const s = content.style;
		s.setProperty("--svaul-nested-scale", String(scale));
		s.setProperty("--svaul-nested-lift", `${translate}px`);
		if (animate) s.removeProperty("--svaul-nested-duration");
		else s.setProperty("--svaul-nested-duration", "0s");
	}

	#clearNestedVars(content: HTMLElement): void {
		content.removeAttribute(ATTR.nested);
		content.style.removeProperty("--svaul-nested-scale");
		content.style.removeProperty("--svaul-nested-lift");
		content.style.removeProperty("--svaul-nested-duration");
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

		// A snap drawer positions itself with an engine-driven inline transform, so the recede has to be
		// composed into that same inline transform (inline wins over the stylesheet). A non-snap drawer
		// publishes the recede as variables and lets the CSS compose it with its data-state transform.
		if (this.hasSnapPoints) {
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
			return;
		}

		if (levels > 0) this.#setNestedVars(content, scale, translate, true);
		else this.#clearNestedVars(content);
	}

	/** Called on the parent as a child drawer is dragged (`percentageDragged` 0→1). */
	onNestedDrag(percentageDragged: number): void {
		if (percentageDragged < 0) return;
		const content = this.contentEl;
		if (!content) return;
		const initialScale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
		const scale = initialScale + percentageDragged * (1 - initialScale);
		const translate = -NESTED_DISPLACEMENT + percentageDragged * NESTED_DISPLACEMENT;
		if (this.hasSnapPoints) {
			set(content, { transition: "none", transform: this.#scaleTransform(scale, translate) });
		} else {
			this.#setNestedVars(content, scale, translate, false);
		}
	}

	/** Called on the parent when a child drag releases and the child stays open. */
	onNestedRelease(childOpen: boolean): void {
		const content = this.contentEl;
		if (!content || !childOpen) return;
		const scale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
		if (this.hasSnapPoints) {
			set(content, {
				transition: `transform ${TRANSITIONS.DURATION}s ${TRANSITION_EASE}`,
				transform: this.#scaleTransform(scale, -NESTED_DISPLACEMENT)
			});
		} else {
			this.#setNestedVars(content, scale, -NESTED_DISPLACEMENT, true);
		}
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
		if (event.pointerType === "touch") {
			// The pointer stream is dead; hand the rest of the gesture to the touch-event fallback.
			this.#pointerCancelled = true;
			return;
		}
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
		// Only drive the drag from touch once the pointer stream has died (pointercancel). Otherwise
		// pointermove already handles it, and running both double-fires onDrag (and corrupts the
		// velocity sampler with duplicate same-position samples).
		if (this.handleOnly || !this.#pointerCancelled) return;
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
		// Only a press that began on the backdrop dismisses. A drag that started inside the drawer
		// (e.g. selecting text) and released over the backdrop must not close it.
		if (this.#pressStartedInsideContent) return;
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
			// Present for the first painted frame after mount → holds the content at the closed offset
			// so removing it releases the transform transition IN (see the CSS + #handleOpen).
			"data-svaul-drawer-starting": this.#starting ? "" : undefined,
			// Present while dragging → the CSS follows --svaul-drawer-swipe with the transition frozen.
			"data-svaul-drawer-swiping": this.#swiping ? "" : undefined,
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
			"data-svaul-drawer-starting": this.#starting ? "" : undefined,
			"data-svaul-drawer-swiping": this.#swiping ? "" : undefined,
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
