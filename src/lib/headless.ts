// Headless escape hatch: the reactive `Drawer` $state class.
//
// Instantiate it during component init and spread its attribute bags
// (`drawer.trigger`, `drawer.content`, `drawer.overlay`, …) onto your own markup.

export { Drawer, type DrawerOptions } from "./core/drawer.svelte.js";
export { setDrawerContext, getDrawerContext } from "./core/context.js";
export { portal, type PortalTarget } from "./a11y/portal.svelte.js";
export type { ScaleOptions } from "./viewport/scale-background.js";
export type { DrawerDirection, SnapPoint, MaybeGetter, Point } from "./core/types.js";
