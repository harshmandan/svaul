// Public entry point.
//
// Default export is the ergonomic single <Drawer> component. The headless `Drawer`
// $state class lives at `@harshmandan/svaul/headless`.

export { default, default as Drawer } from "./components/drawer.svelte";
export type { DrawerControls, DrawerComponentProps } from "./components/drawer.svelte";

// Re-exported so consumers can type a wrapper around <Drawer> or the headless class.
export type { DrawerOptions } from "./core/drawer.svelte.js";
export type { DrawerDirection, SnapPoint, MaybeGetter, Point } from "./core/types.js";
export {
	TRANSITIONS,
	TRANSITION_EASE,
	VELOCITY_THRESHOLD,
	CLOSE_THRESHOLD,
	ATTR
} from "./core/constants.js";
