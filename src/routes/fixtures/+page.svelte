<script lang="ts">
    // Isolated fixtures for the correctness-fix regression tests (Batch B).
    import Drawer from "$lib/index.js";
    import type { SnapPoint } from "$lib/index.js";

    // Dynamic snap points: start undefined, then arrive after open (repro for #4).
    let snaps = $state<SnapPoint[] | undefined>(undefined);
</script>

<main>
    <h1>fixtures</h1>

    <!-- #3: top drawer whose content scrolls vertically. -->
    <Drawer direction="top" class="panel">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open top-scroll</button>
        {/snippet}
        {#snippet title()}Top scroll{/snippet}
        <div data-testid="top-scroller" class="vscroller">
            {#each Array(50) as _, i (i)}<p>Top paragraph #{i + 1}</p>{/each}
        </div>
    </Drawer>

    <!-- horizontal-scroll gate: left drawer with a horizontally scrollable strip. -->
    <Drawer direction="left" class="panel wide">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open left-scroll</button>
        {/snippet}
        {#snippet title()}Left scroll{/snippet}
        <div data-testid="left-scroller" class="hscroller">
            <div class="strip">
                {#each Array(40) as _, i (i)}<span>Cell {i + 1}</span>{/each}
            </div>
        </div>
    </Drawer>

    <!-- right drawer (drag-close coverage for the mirror direction). -->
    <Drawer direction="right" class="panel wide">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open right</button>
        {/snippet}
        {#snippet title()}Right{/snippet}
        <p>Drag me toward the right edge to dismiss.</p>
    </Drawer>

    <!-- non-modal drawer: page stays interactive, dismissed by outside pointerdown. -->
    <button class="btn" data-testid="outside">outside</button>
    <Drawer modal={false} class="panel">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open non-modal</button>
        {/snippet}
        {#snippet title()}Non-modal{/snippet}
        <p>No overlay; click outside to dismiss. Body scroll is not locked.</p>
    </Drawer>

    <!-- non-dismissible: drag/overlay/Escape cannot close it. -->
    <Drawer dismissible={false} class="panel">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open non-dismissible</button>
        {/snippet}
        {#snippet title()}Non-dismissible{/snippet}
        <p>Dragging past the threshold must not close this drawer.</p>
        {#snippet footer({ close })}
            <button class="btn" data-testid="force-close" onclick={close}>Force close</button>
        {/snippet}
    </Drawer>

    <!-- px + calc snap points (resolveLength parser coverage). -->
    <Drawer snapPoints={["160px", "calc(50% + 20px)", 1]} class="panel tall">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open px-snap</button>
        {/snippet}
        {#snippet title()}Px snaps{/snippet}
        <div style="height:60vh"></div>
    </Drawer>

    <!-- #4: snap points that arrive after the drawer is already open. The control lives inside
         the drawer so it isn't covered by the modal overlay. -->
    <Drawer snapPoints={snaps} class="panel tall">
        {#snippet trigger(props)}
            <button {...props} class="btn">Open dynamic-snap</button>
        {/snippet}
        {#snippet title()}Dynamic snaps{/snippet}
        <p>Opens with no snap points; the button introduces them while open.</p>
        <button class="btn" onclick={() => (snaps = [0.5, 1])} data-testid="add-snaps">Add snaps</button>
        <div style="height:60vh"></div>
    </Drawer>
</main>

<style>
    main {
        max-width: 40rem;
        margin: 4rem auto;
        padding: 0 1rem;
        font-family: system-ui, sans-serif;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
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
        padding: 1rem 1.25rem 2rem;
        display: flex;
        flex-direction: column;
    }
    :global([data-svaul-drawer].panel.wide) {
        width: 320px;
    }
    /* Full-height so snap-point offsets translate a real drawer (not a content-sized one). */
    :global([data-svaul-drawer].panel.tall) {
        height: 100%;
        max-height: 97%;
    }
    .vscroller {
        max-height: 40vh;
        overflow-y: auto;
        min-height: 0;
    }
    .hscroller {
        overflow-x: auto;
        max-width: 100%;
    }
    .strip {
        display: flex;
        gap: 1rem;
        width: max-content;
    }
    .strip span {
        flex: 0 0 auto;
        padding: 2rem 1.5rem;
        background: #eee;
        border-radius: 0.5rem;
    }
</style>
