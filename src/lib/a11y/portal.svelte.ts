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
		const find = (): HTMLElement | null => {
			if (typeof target !== "string") return target;
			const found = document.querySelector(target);
			return found instanceof HTMLElement ? found : null;
		};

		let raf = 0;
		let tries = 0;
		const place = () => {
			raf = 0;
			const dest = find();
			if (dest) {
				if (node.parentNode !== dest) dest.appendChild(node);
			} else if (tries++ < 30) {
				// A string target that isn't mounted yet (renders after the drawer): leave the node
				// inline and retry next frame instead of permanently committing it to <body>.
				raf = requestAnimationFrame(place);
			} else if (node.parentNode !== document.body) {
				document.body.appendChild(node); // give up → body
			}
		};
		place();

		return () => {
			if (raf) cancelAnimationFrame(raf);
			if (node.parentNode) node.parentNode.removeChild(node);
		};
	};
}
