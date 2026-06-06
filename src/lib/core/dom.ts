import type { AnyFunction, DrawerDirection } from "./types.js";

type Style = Record<string, string>;

/** Per-element snapshot of styles we overrode, so {@link reset} can restore them. */
const cache = new WeakMap<HTMLElement, Style>();

/** True for `top`/`bottom` drawers (the dragged axis is Y). */
export function isVertical(direction: DrawerDirection): boolean {
	switch (direction) {
		case "top":
		case "bottom":
			return true;
		case "left":
		case "right":
			return false;
		default:
			return direction satisfies never;
	}
}

/** Sign applied to a translate so positive drag distance always means "more open". */
export function directionMultiplier(direction: DrawerDirection): 1 | -1 {
	return direction === "bottom" || direction === "right" ? 1 : -1;
}

/**
 * Imperatively set inline styles on an element, caching the previous values
 * (unless `ignoreCache`) so they can be restored with {@link reset}.
 * Custom properties (`--foo`) are written via `setProperty`.
 */
export function set(el: Element | null | undefined, styles: Style, ignoreCache = false): void {
	if (!el || !(el instanceof HTMLElement)) return;
	const original: Style = {};

	for (const [key, value] of Object.entries(styles)) {
		if (key.startsWith("--")) {
			el.style.setProperty(key, value);
			continue;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		original[key] = (el.style as any)[key];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(el.style as any)[key] = value;
	}

	if (!ignoreCache) cache.set(el, original);
}

/** Restore styles previously cached by {@link set}. Pass `prop` to restore just one. */
export function reset(el: Element | null | undefined, prop?: string): void {
	if (!el || !(el instanceof HTMLElement)) return;
	const original = cache.get(el);
	if (!original) return;

	if (prop) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(el.style as any)[prop] = original[prop];
	} else {
		for (const [key, value] of Object.entries(original)) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(el.style as any)[key] = value;
		}
	}
}

/**
 * Read the current translate (px) of an element along the drawer's axis by
 * parsing its computed `matrix`/`matrix3d`. The DOM is the source of truth for
 * position, so this works even mid-CSS-transition. Returns `null` if unset.
 */
export function getTranslate(element: HTMLElement | null, direction: DrawerDirection): number | null {
	if (!element) return null;
	const style = window.getComputedStyle(element) as CSSStyleDeclaration & {
		webkitTransform?: string;
		mozTransform?: string;
	};
	const transform = style.transform || style.webkitTransform || style.mozTransform || "";

	let mat = transform.match(/^matrix3d\((.+)\)$/);
	if (mat) {
		// https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix3d
		return Number.parseFloat(mat[1].split(", ")[isVertical(direction) ? 13 : 12]);
	}
	// https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix
	mat = transform.match(/^matrix\((.+)\)$/);
	return mat ? Number.parseFloat(mat[1].split(", ")[isVertical(direction) ? 5 : 4]) : null;
}

/** Build a CSS `cssText`-style string from a style record, skipping `undefined`. */
export function styleToString(style: Record<string, number | string | undefined>): string {
	return Object.entries(style).reduce((str, [key, value]) => {
		if (value === undefined) return str;
		return `${str}${key}:${value};`;
	}, "");
}

/**
 * Bulk-assign styles and return a function that restores the element's exact
 * previous `cssText`. Used for the background-scale wrapper, where we want a
 * clean all-or-nothing restore.
 */
export function assignStyle(
	element: HTMLElement | null | undefined,
	style: Partial<CSSStyleDeclaration>
): () => void {
	if (!element) return () => {};
	const prev = element.style.cssText;
	Object.assign(element.style, style);
	return () => {
		element.style.cssText = prev;
	};
}

/** Compose several functions into one that calls each with the same arguments. */
export function chain<T extends AnyFunction>(...fns: (T | undefined)[]) {
	return (...args: Parameters<T>): void => {
		for (const fn of fns) {
			if (typeof fn === "function") fn(...args);
		}
	};
}
