const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
	"audio[controls]",
	"video[controls]",
	"iframe",
	"summary",
	"[contenteditable]:not([contenteditable='false'])"
].join(",");

/** Visible, focusable descendants of `container`, in DOM order. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
		// Skip elements inside inert / aria-hidden / hidden subtrees.
		if (el.closest("[inert],[aria-hidden='true'],[hidden]")) return false;
		return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
	});
}

/**
 * Trap Tab / Shift+Tab focus within `container`. Returns a cleanup function.
 * Does not itself move focus (the caller decides whether to autofocus).
 */
export function trapFocus(container: HTMLElement): () => void {
	const onKeydown = (e: KeyboardEvent) => {
		if (e.key !== "Tab") return;
		// Only the topmost drawer traps. When a drawer opens above this one it marks this
		// drawer's layer `inert`; without this guard the lower drawer's trap would still fire,
		// see focus "outside" its inert container, preventDefault Tab and try to focus its own
		// inert fallback — freezing Tab entirely in stacked drawers.
		if (container.closest("[inert]")) return;
		const focusables = getFocusable(container);
		const active = document.activeElement;

		// If focus has somehow escaped the dialog, pull it back in.
		if (!container.contains(active)) {
			e.preventDefault();
			const target = (e.shiftKey ? focusables[focusables.length - 1] : focusables[0]) ?? container;
			target.focus({ preventScroll: true });
			return;
		}

		if (focusables.length === 0) {
			e.preventDefault();
			container.focus({ preventScroll: true });
			return;
		}
		const first = focusables[0];
		const last = focusables[focusables.length - 1];

		if (e.shiftKey && (active === first || active === container)) {
			e.preventDefault();
			last.focus({ preventScroll: true });
		} else if (!e.shiftKey && (active === last || active === container)) {
			// Tabbing forward from the container itself (programmatically focused when
			// autoFocus is off) must wrap to the first focusable, not escape the dialog.
			e.preventDefault();
			first.focus({ preventScroll: true });
		}
	};

	document.addEventListener("keydown", onKeydown);
	return () => document.removeEventListener("keydown", onKeydown);
}
