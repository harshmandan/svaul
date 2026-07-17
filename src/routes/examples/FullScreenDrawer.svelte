<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Full-screen"
    description="Fills the screen; the whole body scrolls."
    heading="Full-screen"
    fullHeight
    showFooter={false}
>
    {#snippet body()}
        <!-- The body itself is the scroll container and fills the drawer's remaining
             height (flex-1 + min-h-0). Scroll it to the bottom and back — when it's at
             the top, keep swiping down and the drawer closes, mid-gesture. -->
        <div
            class="mt-2 -mx-4 min-h-0 flex-1 overflow-y-auto px-4 text-left text-[15px] leading-relaxed text-gray-600"
        >
            <p>
                A full-height sheet whose content scrolls on its own. When you're
                scrolled to the very top, a downward swipe drags the drawer instead of
                the content — so you can flick it closed without reaching for the handle.
            </p>
            {#each Array(40) as _, i (i)}
                <p class="mt-3">
                    Paragraph #{i + 1}. Scroll down to read, scroll back to the top, then
                    keep swiping down to dismiss.
                </p>
            {/each}
        </div>
    {/snippet}
</SheetExample>
