<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
    import type { DrawerDirection } from "$lib/index.js";
    let {
        direction = "top",
        name,
        description,
    }: {
        direction?: DrawerDirection;
        name?: string;
        description?: string;
    } = $props();

    const heading = $derived(
        `${direction[0].toUpperCase()}${direction.slice(1)} drawer`,
    );
    const explainer = $derived(
        `This drawer slides in from the ${direction}. Drag it back that way, or tap outside, to close. Set \`direction="${direction}"\`.`,
    );
</script>

<SheetExample
    name={name ?? heading}
    description={description ?? `Slides in from the ${direction}.`}
    {explainer}
    {heading}
    {direction}
/>
