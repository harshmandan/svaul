<script lang="ts">
	import Drawer from "$lib/index.js";
	import type { DrawerDirection } from "$lib/index.js";

	let open = $state(false);
	let lastComplete = $state("—");
	let activeSnap = $state<number | string | null>(0.4);

	const dirs: DrawerDirection[] = ["top", "right", "left"];
</script>

<div data-svaul-drawer-wrapper>
<main>
	<h1>svelte-drawer · playground</h1>
	<p>Phases 1–5: open/close, drag, snap points, focus trap, scroll-lock, scaling, nesting.</p>
	<p style="color:#666">Try dragging a drawer down (or toward its edge) to dismiss it.</p>

	<section>
		<h2>Uncontrolled (internal state + trigger)</h2>
		<Drawer class="panel">
			{#snippet trigger(props)}
				<button {...props} class="btn">Open uncontrolled</button>
			{/snippet}
			{#snippet title()}A bottom drawer{/snippet}
			{#snippet description()}Drag the panel down to dismiss it.{/snippet}

			<p>This drawer owns its own open state.</p>
			<p>Click the overlay or the close button to dismiss.</p>

			{#snippet footer({ close })}
				<button class="btn" onclick={close}>Close</button>
			{/snippet}
		</Drawer>
	</section>

	<section>
		<h2>Controlled (<code>bind:open</code>)</h2>
		<button class="btn" onclick={() => (open = !open)}>Toggle externally: {open}</button>
		<Drawer
			bind:open
			direction="bottom"
			class="panel"
			onOpenChangeComplete={(o) => (lastComplete = o ? "opened" : "closed")}
		>
			{#snippet title()}Controlled drawer{/snippet}
			<p>Open state lives in the parent. Last settled: <strong>{lastComplete}</strong></p>
			{#snippet footer({ close })}
				<button class="btn" onclick={close}>Close</button>
			{/snippet}
		</Drawer>
	</section>

	<section>
		<h2>Snap points <code>[0.4, 1]</code> — active: {activeSnap}</h2>
		<Drawer
			snapPoints={[0.4, 1]}
			bind:activeSnapPoint={activeSnap}
			onRelease={(_e, open) => ((window as unknown as { __lastRelease?: boolean }).__lastRelease = open)}
			class="panel snap"
		>
			{#snippet trigger(props)}
				<button {...props} class="btn">Open snap drawer</button>
			{/snippet}
			{#snippet title()}Snap points{/snippet}
			<p>Drag to snap between 40% and 100%. The overlay fades in near the top.</p>
			<p>Scroll this content when expanded; drag the handle to resize.</p>
			<div style="height: 60vh"></div>
			<p>Bottom of content.</p>
		</Drawer>
	</section>

	<section>
		<h2>Directions</h2>
		{#each dirs as dir (dir)}
			<Drawer direction={dir} class="panel">
				{#snippet trigger(props)}
					<button {...props} class="btn">Open {dir}</button>
				{/snippet}
				{#snippet title()}{dir} drawer{/snippet}
				<p>Slides in from the {dir}.</p>
				{#snippet footer({ close })}
					<button class="btn" onclick={close}>Close</button>
				{/snippet}
			</Drawer>
		{/each}
	</section>

	<section>
		<h2>Scale background + focus trap + nested</h2>
		<Drawer scaleBackground autoFocus class="panel">
			{#snippet trigger(props)}
				<button {...props} class="btn">Open scaling drawer</button>
			{/snippet}
			{#snippet title()}Scaled background{/snippet}
			<p>The page behind scales back. Focus is trapped; Escape closes; body scroll is locked.</p>
			<input class="btn" placeholder="autofocused input" style="min-width:14rem" />

			<!-- a nested drawer — opening it displaces this parent -->
			<Drawer class="panel">
				{#snippet trigger(props)}
					<button {...props} class="btn">Open nested drawer</button>
				{/snippet}
				{#snippet title()}Nested{/snippet}
				<p>Opening me pushed the parent back. Drag me down to dismiss.</p>
				{#snippet footer({ close })}
					<button class="btn" onclick={close}>Close nested</button>
				{/snippet}
			</Drawer>

			{#snippet footer({ close })}
				<button class="btn" onclick={close}>Close</button>
			{/snippet}
		</Drawer>
	</section>
</main>
</div>

<style>
	main {
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
	}
	section {
		margin: 2rem 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	section h2 {
		flex-basis: 100%;
		font-size: 1rem;
		color: #444;
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
