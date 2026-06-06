<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Non-dismissible"
    description="Closes only from its own button."
    heading="Non-dismissible"
    explainer={"This drawer only closes from a button you add, like the one below. Set `dismissible={false}`."}
    dismissible={false}
/>
