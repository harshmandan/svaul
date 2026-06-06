<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Scrolling content"
    description="Has a scrollable area inside."
    heading="Scrollable"
    fullHeight
>
    {#snippet body()}
        <!-- Fill the drawer's remaining height (flex-1 + min-h-0), then let the inner
             box take that height and scroll within it. -->
        <div
            class="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col text-left text-[15px] leading-relaxed text-gray-600"
        >
            <p class="shrink-0">The box below scrolls on its own, separate from the drawer.</p>
            <div
                class="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
            >
                {#each Array(40) as _, i (i)}
                    <p>
                        Scrollable paragraph #{i + 1}. Scrolling here doesn't drag the
                        drawer — the gesture is handled by the scroll container, not the
                        sheet.
                    </p>
                {/each}
            </div>
        </div>
    {/snippet}
</SheetExample>
