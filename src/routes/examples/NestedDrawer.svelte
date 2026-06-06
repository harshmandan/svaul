<script lang="ts">
    import SheetExample from "./SheetExample.svelte";

    const innerBtn =
        "rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50";
    const bodyClass = "mx-auto w-full max-w-md text-left text-[15px] leading-relaxed text-gray-600";
</script>

<SheetExample
    name="Nested drawers"
    description="Drawers stacked on top of each other."
    heading="Drawer 1"
    fullHeight
>
    {#snippet body()}
        <div class={bodyClass}>
            <p class="mt-2">
                The first drawer fills the screen. Open another on top of it — each one
                pushes the one below back.
            </p>
            <div class="mt-4">
                <!-- Level 2: opens at half height. Auto-detects drawer 1 as its parent. -->
                <SheetExample
                    triggerClass={innerBtn}
                    label="Open the second drawer"
                    heading="Drawer 2"
                    heightClass="h-full max-h-[50%] p-4 pb-8"
                >
                    {#snippet body()}
                        <div class={bodyClass}>
                            <p class="mt-2">
                                The second drawer opens at half height. One more to go.
                            </p>
                            <div class="mt-4">
                                <!-- Level 3: sizes to its content. -->
                                <SheetExample
                                    triggerClass={innerBtn}
                                    label="Open the third drawer"
                                    heading="Drawer 3"
                                >
                                    {#snippet body()}
                                        <div class={bodyClass}>
                                            <p class="mt-2">
                                                The third drawer is only as tall as its
                                                content. Tap outside to close just this
                                                one and step back down the stack.
                                            </p>
                                        </div>
                                    {/snippet}
                                </SheetExample>
                            </div>
                        </div>
                    {/snippet}
                </SheetExample>
            </div>
        </div>
    {/snippet}
</SheetExample>
