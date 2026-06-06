<script lang="ts">
    import SheetExample from "./SheetExample.svelte";
    let { class: klass = "", label = "Default" }: { class?: string; label?: string } =
        $props();
</script>

<SheetExample triggerClass={klass} {label} heading="Unstyled drawer for Svelte" fullHeight />
