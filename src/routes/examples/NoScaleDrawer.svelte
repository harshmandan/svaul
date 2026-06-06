<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="No background scale"
    description="The page stays still behind it."
    heading="No scaling"
    explainer={"The page behind stays still. `scaleBackground={false}` turns off the card-stack lift the other examples use."}
    scaleBackground={false}
/>
