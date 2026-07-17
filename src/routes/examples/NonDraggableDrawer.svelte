<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Non-draggable region"
    description="Part of it ignores drags."
    heading="Non-draggable region"
    fullHeight
>
    {#snippet body()}
        <div
            class="mx-auto w-full max-w-md text-left text-[15px] leading-relaxed text-gray-600"
        >
            <p class="mt-2">Drag anywhere to move the drawer, except the grey box.</p>
            <div
                data-svaul-drawer-no-drag
                class="mt-4 grid place-items-center gap-1 rounded-lg bg-gray-100 p-5 text-center text-gray-700"
            >
                <p class="font-medium">Try dragging me 👋</p>
                <p class="text-sm text-gray-500">
                    It has <code class="rounded bg-black/5 px-1">data-svaul-drawer-no-drag</code>.
                </p>
            </div>
        </div>
    {/snippet}
</SheetExample>
