<script lang="ts">
    // ─────────────────────────────────────────────────────────────────────────
    // THROWAWAY iOS isolation page for the "whole page flashes orange" bug.
    // A minimal, hand-rolled copy of the scale-background + tint so each toggle
    // isolates ONE mechanism. Open on an iPhone, flip toggles, and note which
    // combination has NO orange flash on open/close. Delete this route after.
    // ─────────────────────────────────────────────────────────────────────────
    const TINT = "#ea580c";

    let open = $state(false);
    let tintMode = $state<"body" | "backdrop">("body");
    let promote = $state(false);
    let lockMode = $state<"fixed" | "overflow" | "none">("fixed");
    let scrollYVar = $state(0);
    let savedTop = 0;

    function lock() {
        const y = window.scrollY;
        savedTop = y;
        if (lockMode === "fixed") {
            const b = document.body.style;
            b.position = "fixed";
            b.top = `-${y}px`;
            b.left = "0";
            b.right = "0";
            b.width = "100%";
        } else if (lockMode === "overflow") {
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        }
    }
    function unlock() {
        if (lockMode === "fixed") {
            const b = document.body.style;
            b.position = b.top = b.left = b.right = b.width = "";
            window.scrollTo(0, savedTop);
        } else if (lockMode === "overflow") {
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        }
    }

    function openSheet() {
        scrollYVar = window.scrollY;
        if (tintMode === "body") document.body.style.background = TINT;
        lock();
        open = true;
    }
    function closeSheet() {
        open = false;
        unlock();
        // Match the library: drop the body tint after the scale settles.
        setTimeout(() => {
            if (tintMode === "body") document.body.style.background = "";
        }, 500);
    }

    // A concise label so a screenshot captures the exact config under test.
    const config = $derived(
        `tint=${tintMode} · promote=${promote ? "on" : "off"} · lock=${lockMode}`,
    );
</script>

<svelte:head><title>flash-test</title></svelte:head>

<!-- Fixed controls: always reachable regardless of scroll / lock. -->
<div class="controls">
    <div class="cfg">{config}</div>
    <div class="row">
        <span>tint</span>
        <button class:on={tintMode === "body"} onclick={() => (tintMode = "body")}>body</button>
        <button class:on={tintMode === "backdrop"} onclick={() => (tintMode = "backdrop")}
            >backdrop</button
        >
    </div>
    <div class="row">
        <span>promote</span>
        <button class:on={!promote} onclick={() => (promote = false)}>off</button>
        <button class:on={promote} onclick={() => (promote = true)}>on</button>
    </div>
    <div class="row">
        <span>lock</span>
        <button class:on={lockMode === "fixed"} onclick={() => (lockMode = "fixed")}>fixed</button>
        <button class:on={lockMode === "overflow"} onclick={() => (lockMode = "overflow")}
            >overflow</button
        >
        <button class:on={lockMode === "none"} onclick={() => (lockMode = "none")}>none</button>
    </div>
    <button class="open" onclick={openSheet}>▲ Open sheet (scroll down first)</button>
</div>

<!-- Fixed tint backdrop (only used in backdrop mode); sits behind the wrapper. -->
{#if tintMode === "backdrop"}
    <div class="backdrop" class:show={open}></div>
{/if}

<!-- The scaled page. transform-origin pinned to the scroll offset, like the library. -->
<div
    class="wrapper"
    class:open
    class:promote
    style="transform-origin: 50% {scrollYVar}px;"
>
    <div class="page">
        <h1>Scroll down, then Open</h1>
        {#each Array(30) as _, i}
            <p>Row {i + 1} — filler content so the page scrolls like the real site.</p>
        {/each}
    </div>
</div>

<!-- The "drawer": a plain bottom sheet that slides up. -->
<div class="sheet" class:open>
    <div class="grab"></div>
    <p>Sheet open. Watch the edges/notch for an orange flash on open AND close.</p>
    <button onclick={closeSheet}>Close</button>
</div>

<style>
    :global(body) {
        margin: 0;
    }
    .controls {
        position: fixed;
        inset: env(safe-area-inset-top) 0 auto 0;
        z-index: 20;
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
    .row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .row span {
        width: 56px;
        color: #9ca3af;
    }
    .controls button {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        border: 0;
        border-radius: 5px;
        padding: 4px 10px;
        font: inherit;
    }
    .controls button.on {
        background: #2563eb;
    }
    .controls .open {
        background: #ea580c;
        padding: 8px;
        font-weight: 600;
    }

    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 0;
        background: #ea580c;
        opacity: 0;
        transition: opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .backdrop.show {
        opacity: 1;
    }

    .wrapper {
        position: relative;
        z-index: 1;
        background: #f9fafb;
        min-height: 100vh;
        transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
    }
    /* promote: keep a compositor layer alive before the scale animates. */
    .wrapper.promote {
        will-change: transform;
        transform: translateZ(0);
    }
    /* open rules come AFTER .promote so they win at equal specificity. */
    .wrapper.open,
    .wrapper.open.promote {
        transform: scale(0.9)
            translate3d(0, calc(env(safe-area-inset-top) + 14px), 0);
    }

    .page {
        padding: 160px 20px 40px;
        color: #111;
        font: 15px/1.6 system-ui, sans-serif;
    }
    .page h1 {
        font-size: 22px;
    }

    .sheet {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
        background: #fff;
        border-radius: 12px 12px 0 0;
        padding: 12px 20px calc(env(safe-area-inset-bottom) + 24px);
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.2);
        transform: translateY(100%);
        transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
        font: 15px/1.5 system-ui, sans-serif;
        color: #111;
    }
    .sheet.open {
        transform: translateY(0);
    }
    .grab {
        width: 40px;
        height: 5px;
        border-radius: 3px;
        background: #d1d5db;
        margin: 0 auto 12px;
    }
    .sheet button {
        margin-top: 12px;
        background: #111;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 10px 20px;
        font: inherit;
    }
</style>
