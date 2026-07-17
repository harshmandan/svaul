<script lang="ts">
    // Isolated fixture for keepMounted behaviour — a keepMounted drawer keeps its
    // overlay/handle/content in the DOM while closed, so it lives on its own route to
    // avoid polluting the shared playground's element locators.
    import Drawer from "$lib/index.js";
</script>

<main>
    <h1>keepMounted fixture</h1>
    <Drawer class="panel" keepMounted>
        {#snippet trigger(props)}
            <button {...props} class="btn">Open keepMounted</button>
        {/snippet}
        {#snippet title()}Kept mounted{/snippet}
        <p>Drag me down to dismiss, then reopen — the panel must not stick mid-drag.</p>
        {#snippet footer({ close })}
            <button class="btn" onclick={close}>Close</button>
        {/snippet}
    </Drawer>
</main>

<style>
    main {
        max-width: 40rem;
        margin: 4rem auto;
        padding: 0 1rem;
        font-family: system-ui, sans-serif;
    }
    .btn {
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        border: 1px solid #ccc;
        background: #fafafa;
        cursor: pointer;
        font: inherit;
    }
    :global([data-svaul-drawer].panel) {
        padding: 1.25rem 1.5rem 2rem;
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.12);
    }
</style>
