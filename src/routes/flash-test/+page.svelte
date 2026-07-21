<script lang="ts">
    // THROWAWAY iOS isolation page for the "whole page flashes orange" bug.
    // Uses the REAL library Drawer (orange scale tint). Each toggle injects a CSS
    // override disabling ONE library-specific feature, to find which stops the
    // flash. Open on an iPhone, flip toggles on open/close. Delete route after.
    import Drawer from "$lib/index.js";

    let killFilter = $state(false);
    let killOverlay = $state(false);
    let killRadius = $state(false);
    let promote = $state(false);

    // Library CSS is in @layer svaul, so these unlayered !important rules win.
    $effect(() => {
        const rules: string[] = [];
        if (killFilter) rules.push("[data-svaul-drawer-wrapper]{filter:none!important}");
        if (killRadius) rules.push("[data-svaul-drawer-wrapper]{border-radius:0!important}");
        if (killOverlay) rules.push("[data-svaul-drawer-overlay]{background:transparent!important}");
        if (promote)
            rules.push(
                "[data-svaul-drawer-wrapper]{will-change:transform;backface-visibility:hidden;-webkit-backface-visibility:hidden}",
            );

        const id = "flash-test-overrides";
        let el = document.getElementById(id) as HTMLStyleElement | null;
        if (!el) {
            el = document.createElement("style");
            el.id = id;
            document.head.appendChild(el);
        }
        el.textContent = rules.join("\n");
        return () => el?.remove();
    });

    const config = $derived(
        "filter=" +
            (killFilter ? "OFF" : "on") +
            " · radius=" +
            (killRadius ? "OFF" : "on") +
            " · overlay=" +
            (killOverlay ? "OFF" : "on") +
            " · promote=" +
            (promote ? "on" : "off"),
    );

    const rows = Array.from({ length: 24 }, (_, i) => i + 1);
</script>

<svelte:head><title>flash-test</title></svelte:head>

<div class="controls">
    <div class="cfg">{config}</div>
    <div class="btnrow">
        <button class:on={killFilter} onclick={() => (killFilter = !killFilter)}>filter {killFilter ? "OFF" : "on"}</button>
        <button class:on={killRadius} onclick={() => (killRadius = !killRadius)}>radius {killRadius ? "OFF" : "on"}</button>
    </div>
    <div class="btnrow">
        <button class:on={killOverlay} onclick={() => (killOverlay = !killOverlay)}>overlay {killOverlay ? "OFF" : "on"}</button>
        <button class:on={promote} onclick={() => (promote = !promote)}>promote {promote ? "on" : "off"}</button>
    </div>
    <p class="hint">Scroll down, open the drawer, watch edges/notch on open + close.</p>
</div>

<div data-svaul-drawer-wrapper class="wrapper">
    <div class="page">
        <h1>Real library tint drawer</h1>
        {#each rows as n}
            <p>Row {n} — filler so the page scrolls.</p>
        {/each}

        <Drawer direction="bottom" scaleBackground backgroundColor="#ea580c" class="panel">
            {#snippet trigger(props)}
                <button {...props} class="open">Open tint drawer</button>
            {/snippet}
            {#snippet handle(props)}
                <div {...props} class="grab"></div>
            {/snippet}
            {#snippet children(controls)}
                <p>Tint drawer open — the page behind should tint orange.</p>
                <button class="close" onclick={controls.close}>Close</button>
            {/snippet}
        </Drawer>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
    }
    .controls {
        position: fixed;
        inset: env(safe-area-inset-top) 0 auto 0;
        z-index: 2000;
        background: rgba(17, 24, 39, 0.95);
        color: #fff;
        padding: 8px 10px;
        font: 12px/1.4 ui-monospace, monospace;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .cfg {
        color: #fbbf24;
    }
    .btnrow {
        display: flex;
        gap: 8px;
    }
    .controls button {
        flex: 1;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        border: 0;
        border-radius: 5px;
        padding: 6px 8px;
        font: inherit;
    }
    .controls button.on {
        background: #16a34a;
    }
    .hint {
        margin: 0;
        color: #9ca3af;
    }
    .wrapper {
        background: #f9fafb;
        min-height: 100vh;
    }
    .page {
        padding: 180px 20px 40px;
        color: #111;
        font: 15px/1.7 system-ui, sans-serif;
    }
    .page h1 {
        font-size: 22px;
    }
    :global(.panel) {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px calc(env(safe-area-inset-bottom) + 28px);
        background: #fff;
        border-radius: 12px 12px 0 0;
        color: #111;
        font: 15px/1.5 system-ui, sans-serif;
    }
    .open {
        margin-top: 12px;
        background: #ea580c;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 12px 18px;
        font: 600 15px system-ui;
    }
    .grab {
        width: 40px;
        height: 5px;
        border-radius: 3px;
        background: #d1d5db;
        margin: 4px auto;
    }
    .close {
        align-self: flex-start;
        background: #111;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 10px 18px;
        font: inherit;
    }
</style>
