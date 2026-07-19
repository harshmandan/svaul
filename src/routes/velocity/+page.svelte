<script lang="ts">
	import Drawer from "$lib/index.js";

	let open = $state(false);

	// Close, then reopen shortly after — makes the interruptible reopen easy to see without
	// hand-timing a flick + tap. The drawer should glide back from wherever it had reached.
	function blip() {
		open = false;
		setTimeout(() => (open = true), 120);
	}
</script>

<main>
	<h1>Velocity close · dev build</h1>
	<p class="lede">
		The close animation now scales with flick speed, and the drawer can be re-opened while it's
		still closing. Compare against the deployed build.
	</p>

	<ul class="tips">
		<li><strong>Flick down fast</strong> → snappy close. <strong>Ease it down</strong> → gentle close.</li>
		<li><strong>Flick down, then immediately tap Open</strong> → it glides back, no wait, no jump.</li>
		<li><strong>Open, then immediately flick</strong> → responds right away (no post-open delay).</li>
	</ul>

	<div class="row">
		<button class="btn" onclick={() => (open = true)}>Open</button>
		<button class="btn" onclick={blip}>Close + reopen (120ms)</button>
	</div>

	<Drawer bind:open class="panel">
		{#snippet title()}Velocity close{/snippet}
		<p>Flick me down at different speeds. Grab me again mid-close.</p>
		<div style="height: 40vh"></div>
		<p>Bottom of content.</p>
	</Drawer>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
		color: #1a1a1a;
	}
	h1 {
		font-size: 1.4rem;
	}
	.lede {
		color: #555;
	}
	.tips {
		color: #333;
		font-size: 0.95rem;
		line-height: 1.7;
		padding-left: 1.1rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 1.5rem;
	}
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid #ccc;
		background: #fafafa;
		cursor: pointer;
		font: inherit;
	}
	.btn:hover {
		background: #f0f0f0;
	}
	:global([data-svaul-drawer].panel) {
		padding: 1.25rem 1.5rem 2rem;
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.12);
	}
</style>
