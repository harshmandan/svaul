<script lang="ts">
    // Shared chrome for every demo drawer: a trigger button, the grabber handle,
    // a title, an optional footer Close button, and a sensible default body.
    // Each "kind" component below is a thin wrapper that sets the props it cares about.
    import Drawer from "$lib/index.js";
    import type { Snippet } from "svelte";
    import type { DrawerControls, DrawerDirection, SnapPoint } from "$lib/index.js";

    interface Props {
        /** Class for the bare trigger <button> (hero usage). */
        triggerClass?: string;
        /** Bare-button label (used when no `description` is given). */
        label?: string;
        /** Card title — providing a `description` switches to the title+description+Open card. */
        name?: string;
        /** Short one-line description shown under the card title. */
        description?: string;
        /** Heading shown inside the drawer. */
        heading?: string;
        dark?: boolean;
        fullHeight?: boolean;
        /** Override the panel's size/padding classes (e.g. a half-height sheet). */
        heightClass?: string;
        direction?: DrawerDirection;
        snapPoints?: SnapPoint[];
        dismissible?: boolean;
        handleOnly?: boolean;
        dragSensitivity?: number;
        disableAnimation?: boolean;
        scaleBackground?: boolean;
        backgroundColor?: string;
        closeLabel?: string;
        /** The snap example hides the footer (you dismiss by dragging). */
        showFooter?: boolean;
        /** Feature-specific text shown in the default body (explains this example). */
        explainer?: string;
        /** Custom drawer body; falls back to the `explainer` / a short intro when omitted. */
        body?: Snippet<[DrawerControls]>;
    }

    let {
        triggerClass = "",
        label = "Open",
        name,
        description,
        heading = "Unstyled drawer for Svelte",
        dark = false,
        fullHeight = false,
        heightClass,
        direction = "bottom",
        snapPoints,
        dismissible = true,
        handleOnly = false,
        dragSensitivity = 1,
        disableAnimation = false,
        scaleBackground = true,
        backgroundColor,
        closeLabel = "Close",
        showFooter = true,
        explainer,
        body,
    }: Props = $props();

    const horizontal = $derived(direction === "left" || direction === "right");

    // Render `backtick`-wrapped spans in the explainer as styled inline code.
    const codeClass = $derived(
        `rounded px-1 text-[0.9em] ${
            dark ? "bg-white/10 text-gray-100" : "bg-black/5 text-gray-800"
        }`,
    );
    const inlineParts = (text: string) =>
        text.split("`").map((t, i) => ({ text: t, code: i % 2 === 1 }));

    // Only round the edge that faces into the screen; the opposite edge sits flush
    // against the viewport border, so rounding it would just show a gap there.
    const radiusClass = $derived(
        {
            bottom: "rounded-t-[10px]",
            top: "rounded-b-[10px]",
            left: "rounded-r-[10px]",
            right: "rounded-l-[10px]",
        }[direction],
    );

    const panelClass = $derived(
        [
            "flex flex-col",
            radiusClass,
            // A border via a custom class — the library ships unstyled, so this just works.
            dark
                ? "border border-gray-800 bg-gray-900 text-gray-100"
                : "border border-gray-200 bg-white",
            heightClass
                ? heightClass
                : snapPoints
                  ? "h-full max-h-[97%] px-4 pt-4"
                  : horizontal
                    ? "h-full w-[400px] max-w-[92vw] p-4"
                    : fullHeight && direction === "bottom"
                      ? "h-full max-h-[96%] p-4 pb-8"
                      : "p-4 pb-8",
        ].join(" "),
    );

    // Place the grabber on the drawer's inner (draggable) edge for each direction.
    const handleClass = $derived.by(() => {
        const base = dark ? "bg-gray-700" : "bg-gray-300";
        switch (direction) {
            case "left":
                return `absolute right-2 top-1/2 h-12 w-1.5 -translate-y-1/2 rounded-full ${base}`;
            case "right":
                return `absolute left-2 top-1/2 h-12 w-1.5 -translate-y-1/2 rounded-full ${base}`;
            case "top":
                return `mx-auto mt-5 h-1.5 w-12 shrink-0 rounded-full ${base}`;
            default:
                return `mx-auto mb-5 h-1.5 w-12 shrink-0 rounded-full ${base}`;
        }
    });
</script>

<Drawer
    {direction}
    class={panelClass}
    {snapPoints}
    {scaleBackground}
    {backgroundColor}
    {dismissible}
    {handleOnly}
    {dragSensitivity}
    {disableAnimation}
>
    {#snippet trigger(props)}
        {#if description}
            <!-- Card: title + short description + a separate "Open" button (the trigger). -->
            <div
                class="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:border-gray-300"
            >
                <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900">{name}</p>
                    <p class="mt-0.5 text-xs text-gray-500">{description}</p>
                </div>
                <button
                    {...props}
                    aria-label={name ? `Open ${name}` : undefined}
                    class="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
                >
                    Open
                </button>
            </div>
        {:else}
            <button {...props} class={triggerClass}>{label}</button>
        {/if}
    {/snippet}

    {#snippet handle(props)}
        <div {...props} class={handleClass}></div>
    {/snippet}

    {#snippet title()}
        <span
            class="mx-auto block w-full max-w-md text-lg font-medium {dark
                ? 'text-white'
                : 'text-gray-900'}"
        >
            {heading}
        </span>
    {/snippet}

    {#snippet children(controls)}
        {#if body}
            {@render body(controls)}
        {:else}
            <div
                class="mx-auto w-full max-w-md text-left text-[15px] leading-relaxed {dark
                    ? 'text-gray-300'
                    : 'text-gray-600'}"
            >
                {#if explainer}
                    <p class="mt-2">
                        {#each inlineParts(explainer) as part}{#if part.code}<code
                                    class={codeClass}>{part.text}</code
                                >{:else}{part.text}{/if}{/each}
                    </p>
                {:else}
                    <p class="mt-2">
                        This component is a Dialog replacement for mobile and tablet. It
                        ships unstyled — bring your own design with a single <code
                            class="rounded bg-black/5 px-1">class</code
                        >.
                    </p>
                    <p class="mt-3">
                        Drag it {horizontal ? "toward its edge" : "down"} to dismiss, or
                        tap outside.
                    </p>
                {/if}
            </div>
        {/if}
    {/snippet}

    {#snippet footer({ close })}
        {#if showFooter}
            <div class="mx-auto mt-auto flex w-full max-w-md gap-3 pt-6">
                <button
                    onclick={close}
                    class="flex-1 rounded-md px-4 py-2 text-sm font-medium {dark
                        ? 'bg-white text-gray-900 hover:bg-gray-100'
                        : 'bg-gray-900 text-white hover:bg-gray-800'}"
                >
                    {closeLabel}
                </button>
            </div>
        {/if}
    {/snippet}
</Drawer>
