import { isIOS } from "../core/browser.js";

/**
 * Body scroll lock — ref-counted (so nested/stacked drawers compose) and always
 * reversible. On iOS Safari (which ignores `overflow: hidden` on `<body>`) it uses
 * the `position: fixed` + restore-scroll technique; elsewhere `overflow: hidden`
 * plus scrollbar-gap compensation to avoid layout shift.
 *
 * Returns a release function. The lock is only torn down once every holder releases,
 * restoring the exact prior styles + scroll position. This fixes the "body locked
 * forever / scroll lost" bugs in the original ports.
 */

let lockCount = 0;
let saved: {
	overflow: string;
	paddingRight: string;
	position: string;
	top: string;
	left: string;
	right: string;
	width: string;
	scrollY: number;
	href: string;
} | null = null;

export interface ScrollLockOptions {
	/** Don't restore scroll position if the URL changed before release (SPA nav). */
	preventScrollRestoration?: boolean;
}

export function lockScroll(opts: ScrollLockOptions = {}): () => void {
	if (typeof document === "undefined") return () => {};

	lockCount++;
	if (lockCount === 1) {
		const body = document.body;
		const scrollY = window.scrollY;
		const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
		saved = {
			overflow: body.style.overflow,
			paddingRight: body.style.paddingRight,
			position: body.style.position,
			top: body.style.top,
			left: body.style.left,
			right: body.style.right,
			width: body.style.width,
			scrollY,
			href: window.location.href
		};

		if (isIOS()) {
			body.style.position = "fixed";
			body.style.top = `-${scrollY}px`;
			body.style.left = "0";
			body.style.right = "0";
			body.style.width = "100%";
		} else {
			body.style.overflow = "hidden";
			if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;
		}
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		lockCount = Math.max(0, lockCount - 1);
		if (lockCount === 0 && saved) {
			const body = document.body;
			body.style.overflow = saved.overflow;
			body.style.paddingRight = saved.paddingRight;
			body.style.position = saved.position;
			body.style.top = saved.top;
			body.style.left = saved.left;
			body.style.right = saved.right;
			body.style.width = saved.width;
			// Skip the scroll restore if the URL changed and the caller opted out (SPA nav).
			const urlChanged = window.location.href !== saved.href;
			if (isIOS() && !(opts.preventScrollRestoration && urlChanged)) {
				window.scrollTo(0, saved.scrollY);
			}
			saved = null;
		}
	};
}
