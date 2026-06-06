import type { MaybeGetter } from "./types.js";

/**
 * Resolve a {@link MaybeGetter} to its current value, falling back when the value
 * (or a getter's result) is `undefined`. Reading inside a reactive context tracks
 * the getter's dependencies, so `() => someState` stays reactive.
 */
export function extract<T>(value: MaybeGetter<T | undefined> | undefined, fallback: T): T {
	if (value === undefined) return fallback;
	if (typeof value === "function") {
		const resolved = (value as () => T | undefined)();
		return resolved === undefined ? fallback : resolved;
	}
	return value;
}

/** Whether a {@link MaybeGetter} currently yields a defined value (i.e. is "controlled"). */
export function isDefined<T>(value: MaybeGetter<T | undefined> | undefined): boolean {
	if (value === undefined) return false;
	if (typeof value === "function") return (value as () => T | undefined)() !== undefined;
	return true;
}

let idCounter = 0;
/** Deterministic, SSR-stable id (increments in render order on both server and client). */
export function createId(prefix = "drawer"): string {
	return `${prefix}-${idCounter++}`;
}
