<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes, ClassValue } from "svelte/elements";
	import { Drawer } from "../core/drawer.svelte.js";
	import { setDrawerContext, getDrawerContext } from "../core/context.js";
	import { portal, type PortalTarget } from "../a11y/portal.svelte.js";
	import type { DrawerDirection, SnapPoint } from "../core/types.js";
	import "../styles/drawer.css";

	/** Props bag handed to a part-snippet; spread it onto your element and add a `class`. */
	type PartProps = Record<string, unknown>;

	/** Imperative controls + reactive state handed to the body snippets. */
	export interface DrawerControls {
		open: () => void;
		close: () => void;
		setOpen: (value: boolean) => void;
		/** Close this drawer and every other open drawer. */
		closeAll: () => void;
		/** Advance to the next snap point (if any). */
		cycleSnapPoint: () => void;
		/** Reactive read accessors (so a snippet can branch on state without reaching into `drawer`). */
		readonly isOpen: boolean;
		readonly activeSnapPoint: SnapPoint | null;
		readonly activeSnapPointIndex: number;
		readonly isLastSnapPoint: boolean;
		/** The underlying instance — advanced/escape-hatch use. */
		drawer: Drawer;
	}

	export interface DrawerComponentProps
		extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children" | "class" | "style" | "id"> {
		/** Controlled/bindable open state. Use `bind:open`, or `open` + `onOpenChange`. */
		open?: boolean;
		/** Initial open state when uncontrolled. */
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Fires once the open/close animation settles. */
		onOpenChangeComplete?: (open: boolean) => void;
		/** Per-move drag callback `(event, percentageDragged)`. */
		onDrag?: (event: PointerEvent, percentageDragged: number) => void;
		/** On release `(event, open)` where `open` is the resulting state. */
		onRelease?: (event: PointerEvent | null, open: boolean) => void;
		/** Called when the drawer closes. */
		onClose?: () => void;
		direction?: DrawerDirection;
		dismissible?: boolean;
		modal?: boolean;
		/** Accessible name when no `title` snippet is provided. */
		ariaLabel?: string;
		/** Base id for content/title/description (defaults to an SSR-stable generated id). */
		id?: string;
		snapPoints?: SnapPoint[];
		/** Controlled/bindable active snap point. */
		activeSnapPoint?: SnapPoint | null;
		onActiveSnapPointChange?: (snapPoint: SnapPoint | null) => void;
		fadeFromIndex?: number;
		snapToSequentialPoint?: boolean;
		container?: HTMLElement | null;
		closeThreshold?: number;
		dragSensitivity?: number;
		handleOnly?: boolean;
		onlyPrimaryPointer?: boolean;
		autoFocus?: boolean;
		noBodyStyles?: boolean;
		disablePreventScroll?: boolean;
		scaleBackground?: boolean;
		setBackgroundColorOnScale?: boolean;
		backgroundColor?: string;
		borderRadius?: number;
		repositionInputs?: boolean;
		preventScrollRestoration?: boolean;
		disableAnimation?: boolean;
		/** Force standalone (don't auto-nest even inside another drawer). */
		nested?: boolean;
		/** Portal target for the overlay + content. `false` renders inline. Default `body`. */
		portalTarget?: PortalTarget | false;
		/** Keep the content mounted (hidden with `visibility` + inert) while closed instead of
		 *  unmounting it, so it can be measured or queried before first open. */
		keepMounted?: boolean;
		/** Class/style for the default content panel (ignored if you supply a `content` snippet). */
		class?: ClassValue;
		style?: string;

		// structural snippets — supply only the parts you want to own
		trigger?: Snippet<[PartProps]>;
		overlay?: Snippet<[PartProps]> | false;
		content?: Snippet<[PartProps]>;
		handle?: Snippet<[PartProps]> | boolean;
		title?: Snippet;
		description?: Snippet;
		header?: Snippet<[DrawerControls]>;
		footer?: Snippet<[DrawerControls]>;
		children?: Snippet<[DrawerControls]>;
	}

	let {
		open = $bindable(undefined),
		defaultOpen,
		onOpenChange,
		onOpenChangeComplete,
		onDrag,
		onRelease,
		onClose,
		direction = "bottom",
		dismissible = true,
		modal = true,
		ariaLabel,
		id,
		snapPoints,
		activeSnapPoint = $bindable(undefined),
		onActiveSnapPointChange,
		fadeFromIndex,
		snapToSequentialPoint,
		container,
		closeThreshold,
		dragSensitivity,
		handleOnly,
		onlyPrimaryPointer,
		autoFocus,
		noBodyStyles,
		disablePreventScroll,
		scaleBackground,
		setBackgroundColorOnScale,
		backgroundColor,
		borderRadius,
		repositionInputs,
		preventScrollRestoration,
		disableAnimation,
		nested,
		portalTarget = "body",
		keepMounted = false,
		class: klass,
		style,
		trigger,
		overlay,
		content,
		handle = true,
		title,
		description,
		header,
		footer,
		children,
		...rest
	}: DrawerComponentProps = $props();

	// Auto-detect a parent drawer for the nested depth effect (unless forced standalone).
	// svelte-ignore state_referenced_locally -- nesting is resolved once at init
	const parent = nested === false ? null : getDrawerContext();
	// SSR-stable base id (overridable via the `id` prop) — avoids hydration mismatches.
	const baseId = $props.id();

	const drawer = new Drawer({
		open: () => open,
		// eslint-disable-next-line svelte/valid-compile -- init-only seed for uncontrolled mode
		// svelte-ignore state_referenced_locally
		defaultOpen,
		// svelte-ignore state_referenced_locally
		id: id ?? baseId,
		onOpenChange: (v) => {
			open = v;
			onOpenChange?.(v);
		},
		onOpenChangeComplete: (o) => onOpenChangeComplete?.(o),
		onDrag: (e, p) => onDrag?.(e, p),
		onRelease: (e, o) => onRelease?.(e, o),
		onClose: () => onClose?.(),
		direction: () => direction,
		dismissible: () => dismissible,
		modal: () => modal,
		ariaLabel: () => ariaLabel,
		snapPoints: () => snapPoints,
		activeSnapPoint: () => activeSnapPoint,
		onActiveSnapPointChange: (p) => {
			activeSnapPoint = p ?? undefined;
			onActiveSnapPointChange?.(p);
		},
		fadeFromIndex: () => fadeFromIndex,
		snapToSequentialPoint: () => snapToSequentialPoint,
		container: () => container,
		closeThreshold: () => closeThreshold,
		dragSensitivity: () => dragSensitivity,
		handleOnly: () => handleOnly,
		onlyPrimaryPointer: () => onlyPrimaryPointer,
		autoFocus: () => autoFocus,
		noBodyStyles: () => noBodyStyles,
		disablePreventScroll: () => disablePreventScroll,
		scaleBackground: () => scaleBackground,
		setBackgroundColorOnScale: () => setBackgroundColorOnScale,
		backgroundColor: () => backgroundColor,
		borderRadius: () => borderRadius,
		repositionInputs: () => repositionInputs,
		preventScrollRestoration: () => preventScrollRestoration,
		disableAnimation: () => disableAnimation,
		parent
	});
	setDrawerContext(drawer);

	// Set synchronously (runs during SSR too) so the server-rendered dialog already carries its
	// `aria-labelledby`/`aria-describedby` — an $effect alone runs only on the client, leaving the
	// SSR markup with no accessible name. The effect then keeps it in sync if the snippet changes.
	// svelte-ignore state_referenced_locally
	drawer.hasTitle = title != null;
	// svelte-ignore state_referenced_locally
	drawer.hasDescription = description != null;
	$effect(() => {
		drawer.hasTitle = title != null;
		drawer.hasDescription = description != null;
	});

	const showOverlay = $derived(overlay !== false && drawer.modal);
	// Merge the library's content style (snap-point CSS var) with the user's style.
	const contentStyle = $derived([drawer.content.style, style].filter(Boolean).join("; ") || undefined);
	// Top/left drawers hang from the opposite edge, so the handle renders last.
	const handleAtEnd = $derived(drawer.direction === "top" || drawer.direction === "left");

	const controls: DrawerControls = {
		open: () => drawer.openDrawer(),
		close: () => drawer.closeDrawer(true),
		setOpen: (v) => drawer.setOpen(v),
		closeAll: () => drawer.closeAll(),
		cycleSnapPoint: () => drawer.cycleSnapPoint(),
		get isOpen() {
			return drawer.open;
		},
		get activeSnapPoint() {
			return drawer.activeSnapPoint;
		},
		get activeSnapPointIndex() {
			return drawer.activeSnapPointIndex;
		},
		get isLastSnapPoint() {
			return drawer.isLastSnapPoint;
		},
		drawer
	};
</script>

{#if trigger}{@render trigger(drawer.trigger)}{/if}

{#if keepMounted || drawer.present}
	{#snippet tree()}
		{#if showOverlay}
			{#if typeof overlay === "function"}
				{@render overlay(drawer.overlay)}
			{:else}
				<div {...drawer.overlay}></div>
			{/if}
		{/if}

		{#if content}
			{@render content(drawer.content)}
		{:else}
			<div {...drawer.content} {...rest} class={klass} style={contentStyle}>
				<!-- The handle sits on the drawer's inner (draggable) edge: top for a
				     bottom drawer, bottom for a top drawer, etc. -->
				{#if !handleAtEnd}{@render handleBlock()}{/if}
				{#if header}{@render header(controls)}{/if}
				{#if title}<h2 {...drawer.title}>{@render title()}</h2>{/if}
				{#if description}<p {...drawer.description}>{@render description()}</p>{/if}
				{@render children?.(controls)}
				{#if footer}{@render footer(controls)}{/if}
				{#if handleAtEnd}{@render handleBlock()}{/if}
			</div>
		{/if}
	{/snippet}

	<!-- When keepMounted, the content stays in the DOM while closed. Hide it with visibility (not
	     display:none) so it keeps layout and can still be measured/queried, and inert it. -->
	{@const hidden = keepMounted && !drawer.present}
	{#if portalTarget === false}
		<div style={hidden ? "display: contents; visibility: hidden" : "display: contents"} inert={hidden || undefined}>
			{@render tree()}
		</div>
	{:else}
		<div
			style={hidden ? "display: contents; visibility: hidden" : "display: contents"}
			inert={hidden || undefined}
			{@attach portal(portalTarget)}
		>
			{@render tree()}
		</div>
	{/if}
{/if}

{#snippet handleBlock()}
	{#if handle}
		{#if typeof handle === "function"}
			{@render handle(drawer.handle)}
		{:else}
			<div {...drawer.handle}><span data-svaul-drawer-handle-hitarea></span></div>
		{/if}
	{/if}
{/snippet}
