<script lang="ts">
    import { base } from "$app/paths";
    import DefaultDrawer from "./examples/DefaultDrawer.svelte";
    import NonDismissibleDrawer from "./examples/NonDismissibleDrawer.svelte";
    import ScrollableDrawer from "./examples/ScrollableDrawer.svelte";
    import FormDrawer from "./examples/FormDrawer.svelte";
    import NonDraggableDrawer from "./examples/NonDraggableDrawer.svelte";
    import SnapPointsDrawer from "./examples/SnapPointsDrawer.svelte";
    import HandleOnlyDrawer from "./examples/HandleOnlyDrawer.svelte";
    import AmplifiedDrawer from "./examples/AmplifiedDrawer.svelte";
    import DirectionDrawer from "./examples/DirectionDrawer.svelte";
    import DarkDrawer from "./examples/DarkDrawer.svelte";
    import NoScaleDrawer from "./examples/NoScaleDrawer.svelte";
    import TintDrawer from "./examples/TintDrawer.svelte";
    import InstantDrawer from "./examples/InstantDrawer.svelte";
    import NestedDrawer from "./examples/NestedDrawer.svelte";

    const primaryBtn =
        "rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800";
    const ghostBtn =
        "rounded-full px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100";
</script>

<div data-drawer-wrapper class="min-h-screen bg-gray-50">
    <!-- Intro — fills the viewport; examples live below the fold. dvh tracks the
         *dynamic* viewport so the mobile URL bar doesn't cover the bottom hint. -->
    <section
        class="relative mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 text-center"
    >
        <div class="group relative inline-block">
            <!-- Drawer logo: hidden in an overflow clip above the title, slides up
                 into view on hover (translate-y-full → translate-y-0). -->
            <span
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 bottom-full mb-3 overflow-hidden"
            >
                <img
                    src="{base}/favicon.svg"
                    alt=""
                    class="block w-full translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0"
                />
            </span>
            <h1
                class="text-balance text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl"
            >
                Svaul
            </h1>
        </div>
        <p class="mt-5 max-w-md text-pretty text-lg text-gray-600">
            A drawer component for svelte 5. Feature rich, built from scratch
            with svelte runes and with no dependencies.
        </p>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <DefaultDrawer class={primaryBtn} label="Open Drawer" />
            <a
                href="https://github.com/harshmandan/svaul"
                target="_blank"
                rel="noreferrer"
                class={ghostBtn}
            >
                GitHub <span aria-hidden="true">→</span>
            </a>
        </div>

        <div
            class="absolute inset-x-0 bottom-8 flex flex-col items-center gap-1 text-sm text-gray-400"
        >
            <p>
                Inspired by
                <a class="underline hover:text-gray-600" href="https://vaul.emilkowal.ski"
                    >vaul</a
                >
                and
                <a class="underline hover:text-gray-600" href="https://vaul-svelte.com"
                    >vaul-svelte</a
                >.
            </p>
            <p class="flex items-center gap-1 font-medium text-gray-500">
                Scroll to view examples <span aria-hidden="true">↓</span>
            </p>
        </div>
    </section>

    <!-- Examples -->
    <section class="mx-auto max-w-2xl space-y-7 px-6 pb-24 text-left">
        <section>
            <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                Essentials
            </h2>
            <div class="mt-3 space-y-2">
                <NonDismissibleDrawer />
                <ScrollableDrawer />
                <FormDrawer />
                <NonDraggableDrawer />
            </div>
        </section>

        <section>
            <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                Gestures &amp; snapping
            </h2>
            <div class="mt-3 space-y-2">
                <SnapPointsDrawer />
                <HandleOnlyDrawer />
                <AmplifiedDrawer />
            </div>
        </section>

        <section>
            <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                Direction
            </h2>
            <div class="mt-3 space-y-2">
                <DirectionDrawer direction="top" />
                <DirectionDrawer direction="left" />
                <DirectionDrawer direction="right" />
            </div>
        </section>

        <section>
            <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                Styling &amp; motion
            </h2>
            <div class="mt-3 space-y-2">
                <DarkDrawer />
                <NoScaleDrawer />
                <TintDrawer />
                <InstantDrawer />
                <NestedDrawer />
            </div>
        </section>
    </section>
</div>
