/** Direction the drawer slides in from / is dragged toward to dismiss. */
export type DrawerDirection = "top" | "bottom" | "left" | "right";

/**
 * A snap point. A `number` in `(0, 1]` is a fraction of the container size;
 * a `string` like `"300px"` is an absolute pixel offset.
 */
export type SnapPoint = number | string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;

/**
 * A value that may be supplied directly or as a getter, so reactive `$state`
 * can be threaded into the core class without losing reactivity.
 *
 * @example new Drawer({ snapPoints: () => mySnapPoints })
 */
export type MaybeGetter<T> = T | (() => T);

/** A pair of x/y numbers (pointer position, delta, etc.). */
export interface Point {
	x: number;
	y: number;
}
