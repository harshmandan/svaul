/**
 * Tunable physics + timing constants.
 *
 * Most are ported verbatim from the original `vaul` (constants.ts) so the feel matches
 * the library people already know. A handful of values that vaul hard-coded inline
 * (handle tap timings, swipe-start thresholds, keyboard detection) are named here.
 */

/** Master transition: duration in seconds + cubic-bezier control points. */
export const TRANSITIONS = {
	DURATION: 0.5,
	EASE: [0.32, 0.72, 0, 1]
} as const;

/** Pre-built CSS easing string, e.g. `cubic-bezier(0.32,0.72,0,1)`. */
export const TRANSITION_EASE = `cubic-bezier(${TRANSITIONS.EASE.join(",")})`;

/** Release velocity (px/ms) above which a drag closes regardless of distance. */
export const VELOCITY_THRESHOLD = 0.4;

/** Fraction of the drawer size that must be dragged past to close on release. */
export const CLOSE_THRESHOLD = 0.25;

/** After scrolling inner content, dragging the drawer is blocked for this long (ms). */
export const SCROLL_LOCK_TIMEOUT = 100;

/** Drawer corner radius (px) used by the background-scale "card stack" effect. */
export const BORDER_RADIUS = 8;

/** How far (px) a parent drawer is displaced when a nested drawer opens. */
export const NESTED_DISPLACEMENT = 16;

/** Top inset (px) used when computing the scaled-background scale factor. */
export const WINDOW_TOP_OFFSET = 26;

/** Velocity (px/ms) above which a flick skips intermediate snap points. */
export const FLING_VELOCITY = 2;

/** Swipe-intent thresholds (px) before a gesture commits to a drag, by pointer type. */
export const SWIPE_START_THRESHOLD_TOUCH = 10;
export const SWIPE_START_THRESHOLD_MOUSE = 2;

/** Handle (grabber) tap timings. */
export const DOUBLE_TAP_TIMEOUT = 120;
export const LONG_HANDLE_PRESS_TIMEOUT = 250;

/** Window after a fast release during which inputs won't auto-focus (ms). */
export const JUST_RELEASED_TIMEOUT = 200;

/** Min change in keyboard height (px) to treat as an open/close transition. */
export const KEYBOARD_CHANGE_THRESHOLD = 60;

/** Extra breathing room (px) kept above the on-screen keyboard. */
export const KEYBOARD_BUFFER = 24;

/** Class toggled on the drawer + overlay while a drag is in progress. */
export const DRAG_CLASS = "drawer-dragging";

/** Data-attribute namespace for hooks/selectors this library owns. */
export const ATTR = {
	drawer: "data-drawer",
	direction: "data-drawer-direction",
	visible: "data-drawer-visible",
	overlay: "data-drawer-overlay",
	handle: "data-drawer-handle",
	handleHitarea: "data-drawer-handle-hitarea",
	snapPoints: "data-drawer-snap-points",
	snapPointsOverlay: "data-drawer-snap-points-overlay",
	wrapper: "data-drawer-wrapper",
	noDrag: "data-drawer-no-drag",
	noAnimate: "data-drawer-no-animate"
} as const;
