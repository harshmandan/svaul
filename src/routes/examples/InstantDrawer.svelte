<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Instant (no transitions)"
    description="Opens and closes with no animation."
    heading="No transitions"
    explainer={"No animation here — opening, closing and the background all snap instantly. Set `disableAnimation`."}
    disableAnimation
/>
