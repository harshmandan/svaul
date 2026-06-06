<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
</script>

<SheetExample
    name="Amplified drag"
    description="Moves twice as far as the pointer."
    heading="Amplified drag"
    explainer={"Drag down and the drawer moves twice as far as your pointer, for a snappier feel. Set `dragSensitivity={2}`."}
    dragSensitivity={2}
    fullHeight
/>
