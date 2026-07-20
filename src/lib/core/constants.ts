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

/**
 * Velocity-scaled close ("throw") tuning. On a swipe release the close duration is the physical
 * time to cover the remaining distance at the release speed (`remaining / velocity`), clamped, then
 * RE-NORMALIZED to a 0.1–1 scalar and multiplied by `BASE_MS`. So a hard flick ≈ `MIN_SCALAR *
 * BASE_MS` (40ms) and a gentle throw ≈ `MAX_SCALAR * BASE_MS` (400ms) — deliberately snappier than
 * the default close transition.
 */
export const RELEASE = {
	/** Release speed (px/ms) is clamped to this band before a duration is derived. */
	MIN_VELOCITY: 0.2,
	MAX_VELOCITY: 4,
	/** Physical `remaining / velocity` (ms) is clamped here before normalization. */
	MIN_DURATION_MS: 80,
	MAX_DURATION_MS: 360,
	/** The clamped duration is remapped onto this scalar band … */
	MIN_SCALAR: 0.1,
	MAX_SCALAR: 1,
	/** … then multiplied by this base to get the applied transition duration (ms). */
	BASE_MS: 400,
	/** Release velocity is sampled from the last ≤ this many ms of pointer motion (instantaneous,
	 *  not averaged over the whole gesture) — so a slow drag ending in a flick reads as fast. */
	SAMPLE_MAX_AGE_MS: 80,
	/** Floor on the sample interval (ms) so a near-zero dt can't blow up the velocity. */
	SAMPLE_MIN_DT_MS: 16
} as const;

/** Fraction of the drawer size that must be dragged past to close on release. */
export const CLOSE_THRESHOLD = 0.25;

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

/** Minimum travel (px) before the scroll-vs-drag decision is made — real touch fires an initial
 *  zero-displacement move, and deciding then can't tell an up-swipe (scroll) from a close drag. */
export const DIRECTION_COMMIT_PX = 4;

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
export const DRAG_CLASS = "svaul-drawer-dragging";

/** Data-attribute namespace for hooks/selectors this library owns. */
export const ATTR = {
	drawer: "data-svaul-drawer",
	direction: "data-svaul-drawer-direction",
	overlay: "data-svaul-drawer-overlay",
	handle: "data-svaul-drawer-handle",
	handleHitarea: "data-svaul-drawer-handle-hitarea",
	snapPoints: "data-svaul-drawer-snap-points",
	snapPointsOverlay: "data-svaul-drawer-snap-points-overlay",
	wrapper: "data-svaul-drawer-wrapper",
	/** Present on the wrapper while it is scaled behind a drawer; drives the CSS card-stack rules. */
	scaled: "data-svaul-drawer-scaled",
	/** Direction of the drawer driving the wrapper scale (picks the lift axis / transform-origin). */
	scaleDirection: "data-svaul-drawer-scale-direction",
	/** Present on a drawer that is stepped back behind its open descendants (nested recede). */
	nested: "data-svaul-drawer-nested",
	noDrag: "data-svaul-drawer-no-drag",
	noAnimate: "data-svaul-drawer-no-animate",
	/** User-applied marker on non-drawer elements (e.g. a portaled popover/select) telling
	 *  svaul to treat them as "inside" for outside-click dismissal. Not a drawer part, so it
	 *  carries the library brand rather than the `-drawer-` element prefix. */
	ignore: "data-svaul-ignore"
} as const;
