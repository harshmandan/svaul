/**
 * A shared stack of open, dismissible drawers so a single Escape press closes only
 * the topmost one (nested-aware). The keydown listener is attached lazily and torn
 * down when the stack empties.
 */

interface EscapeEntry {
	close: () => void;
	dismissible: () => boolean;
}

const stack: EscapeEntry[] = [];
let attached = false;

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== "Escape") return;
	// Escape during IME composition confirms/cancels the composition — it must not also
	// dismiss the drawer (keyCode 229 covers browsers that omit `isComposing`).
	if (event.isComposing || event.keyCode === 229) return;
	const top = stack[stack.length - 1];
	if (top && top.dismissible()) {
		event.preventDefault();
		top.close();
	}
}

/** Register a drawer as escapable; returns an unregister function. */
export function pushEscape(entry: EscapeEntry): () => void {
	if (typeof document === "undefined") return () => {};
	stack.push(entry);
	if (!attached) {
		document.addEventListener("keydown", onKeydown);
		attached = true;
	}
	return () => {
		const i = stack.lastIndexOf(entry);
		if (i >= 0) stack.splice(i, 1);
		if (stack.length === 0 && attached) {
			document.removeEventListener("keydown", onKeydown);
			attached = false;
		}
	};
}

/** Whether `entry` is the topmost open drawer (used for non-modal outside-click). */
export function isTopmost(entry: EscapeEntry): boolean {
	return stack[stack.length - 1] === entry;
}

/** Close every open drawer (topmost first). */
export function closeAllDrawers(): void {
	for (const entry of [...stack].reverse()) entry.close();
}
