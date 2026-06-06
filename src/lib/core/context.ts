import { getContext, hasContext, setContext } from "svelte";
import type { Drawer } from "./drawer.svelte.js";

const DRAWER_CONTEXT = Symbol("svelte-drawer");

/** Provide a {@link Drawer} instance to descendant parts. */
export function setDrawerContext(drawer: Drawer): Drawer {
	return setContext(DRAWER_CONTEXT, drawer);
}

/** Read the nearest ancestor {@link Drawer}, or `null` if there isn't one. */
export function getDrawerContext(): Drawer | null {
	return hasContext(DRAWER_CONTEXT) ? getContext<Drawer>(DRAWER_CONTEXT) : null;
}
