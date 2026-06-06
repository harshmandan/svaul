import type { Attachment } from "svelte/attachments";

export type PortalTarget = HTMLElement | string;

/**
 * Attachment that relocates its element to `target` (default `document.body`) on
 * mount and removes it on cleanup. Client-only — during SSR the element renders
 * inline and is portalled once hydrated.
 *
 * @example <div {@attach portal()}> … </div>
 */
export function portal(target: PortalTarget = "body"): Attachment {
	return (node) => {
		const resolve = (): HTMLElement => {
			if (typeof target === "string") {
				const found = document.querySelector(target);
				if (found instanceof HTMLElement) return found;
				return document.body;
			}
			return target;
		};

		const dest = resolve();
		if (node.parentNode !== dest) dest.appendChild(node);

		return () => {
			if (node.parentNode) node.parentNode.removeChild(node);
		};
	};
}
