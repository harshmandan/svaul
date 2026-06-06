<script lang="ts">
	import Drawer from "$lib/index.js";
	import type { DrawerDirection } from "$lib/index.js";

	// ---- feature toggles (each maps to a real prop / filed-issue scenario) ----
	const cfg = $state({
		snapPoints: false,
		scaleBackground: false,
		nested: false,
		dismissible: true,
		modal: true,
		handleOnly: false,
		disableAnimation: false,
		repositionInputs: true,
		form: false,
		scrollContent: false,
		interceptBack: false
	});

	type ToggleKey = keyof typeof cfg;
	const toggles: { key: ToggleKey; label: string; hint: string }[] = [
		{ key: "snapPoints", label: "Snap points", hint: "rests at [0.5, 1]; drag to resize" },
		{ key: "scaleBackground", label: "Scale background", hint: "iOS card-stack effect" },
		{ key: "nested", label: "Nested drawer", hint: "shows an 'Open nested' button inside" },
		{ key: "scrollContent", label: "Scrolling content", hint: "long body — scroll vs. drag gate" },
		{ key: "form", label: "Form", hint: "inputs + textarea inside the drawer" },
		{ key: "repositionInputs", label: "Reposition inputs", hint: "lift inputs above the keyboard" },
		{ key: "interceptBack", label: "Intercept back button", hint: "browser Back closes the drawer" },
		{ key: "disableAnimation", label: "Disable transitions", hint: "instant open/close/snap" },
		{ key: "handleOnly", label: "Handle only", hint: "drag only via the grabber" },
		{ key: "dismissible", label: "Dismissible", hint: "drag / overlay / Esc can close" },
		{ key: "modal", label: "Modal", hint: "overlay + scroll lock + focus trap" }
	];

	let direction = $state<DrawerDirection>("bottom");
	let open = $state(false);
	let submitted = $state("");

	// ---- "intercept browser back button" (page-level pattern) ----
	let pushedByDrawer = false;
	$effect(() => {
		if (!cfg.interceptBack) return;
		const onPop = () => {
			if (open) {
				pushedByDrawer = false;
				open = false;
			}
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	});
	$effect(() => {
		if (!cfg.interceptBack) return;
		if (open && !pushedByDrawer) {
			pushedByDrawer = true;
			history.pushState({ drawer: true }, "");
		} else if (!open && pushedByDrawer) {
			pushedByDrawer = false;
			history.back(); // remove our pushed entry on a programmatic close
		}
	});

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const data = new FormData(e.target as HTMLFormElement);
		submitted = `Submitted as ${data.get("name") || "anonymous"}`;
	}
</script>

<div data-drawer-wrapper>
	<main>
		<header>
			<h1>svelte-drawer</h1>
			<p>An unstyled, runes-first drawer for Svelte 5. Toggle features, then open the drawer.</p>
		</header>

		<fieldset class="toggles">
			<legend>Features</legend>
			{#each toggles as t (t.key)}
				<label class="toggle" title={t.hint}>
					<input type="checkbox" bind:checked={cfg[t.key]} />
					<span>{t.label}</span>
					<small>{t.hint}</small>
				</label>
			{/each}
			<label class="toggle">
				<span>Direction</span>
				<select bind:value={direction}>
					<option value="bottom">bottom</option>
					<option value="top">top</option>
					<option value="left">left</option>
					<option value="right">right</option>
				</select>
			</label>
		</fieldset>

		{#if submitted}<p class="note">{submitted}</p>{/if}

		<Drawer
			bind:open
			{direction}
			snapPoints={cfg.snapPoints ? [0.5, 1] : undefined}
			scaleBackground={cfg.scaleBackground}
			dismissible={cfg.dismissible}
			modal={cfg.modal}
			handleOnly={cfg.handleOnly}
			disableAnimation={cfg.disableAnimation}
			repositionInputs={cfg.repositionInputs}
			class="drawer-panel"
		>
			{#snippet trigger(props)}
				<button {...props} class="open-btn">Open drawer</button>
			{/snippet}
			{#snippet title()}Drawer{/snippet}
			{#snippet description()}Configured by the toggles above.{/snippet}

			<div class="body" class:scroll={cfg.scrollContent} class:tall={cfg.snapPoints}>
				{#if cfg.form}
					<form onsubmit={onSubmit} class="form">
						<input name="name" placeholder="Name" />
						<input name="email" type="email" placeholder="Email" />
						<textarea name="message" placeholder="Message" rows="3"></textarea>
						<button type="submit" class="btn">Submit</button>
					</form>
				{:else}
					<p>This is a drawer. Drag it {direction === "bottom" ? "down" : "toward its edge"} to dismiss.</p>
				{/if}

				{#if cfg.nested}
					<Drawer class="drawer-panel">
						{#snippet trigger(props)}
							<button {...props} class="btn">Open nested drawer</button>
						{/snippet}
						{#snippet title()}Nested drawer{/snippet}
						<p>Opening me pushed the parent back. Drag me down to dismiss.</p>
						{#snippet footer({ close })}
							<button class="btn" onclick={close}>Close nested</button>
						{/snippet}
					</Drawer>
				{/if}

				{#if cfg.scrollContent}
					{#each Array(20) as _, i (i)}
						<p>Scrollable paragraph #{i + 1} — scrolling here should not drag the drawer.</p>
					{/each}
				{/if}
			</div>

			{#snippet footer({ close })}
				<button class="btn primary" onclick={close}>Close</button>
			{/snippet}
		</Drawer>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #f4f4f5;
	}
	/* The scaled wrapper needs its own opaque background + full height, so the
	   `setBackgroundColorOnScale` black only shows in the lifted gap behind it
	   (not through a transparent page). */
	[data-drawer-wrapper] {
		display: block;
		min-height: 100vh;
		background: #f4f4f5;
	}
	main {
		max-width: 34rem;
		margin: 0 auto;
		padding: 4rem 1.25rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: #18181b;
	}
	header h1 {
		margin: 0 0 0.25rem;
		font-size: 1.6rem;
	}
	header p {
		margin: 0 0 2rem;
		color: #52525b;
	}
	.toggles {
		border: 1px solid #e4e4e7;
		border-radius: 0.75rem;
		background: #fff;
		padding: 1rem 1.25rem 1.25rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem 1.25rem;
	}
	.toggles legend {
		font-weight: 600;
		padding: 0 0.4rem;
	}
	.toggle {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.1rem 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.toggle small {
		grid-column: 2;
		color: #71717a;
		font-size: 0.72rem;
	}
	.toggle select {
		grid-column: 2;
		justify-self: start;
		font: inherit;
		padding: 0.2rem;
	}
	.note {
		margin-top: 1rem;
		color: #15803d;
		font-weight: 600;
	}
	.open-btn {
		margin-top: 2rem;
		padding: 0.7rem 1.4rem;
		font: inherit;
		font-weight: 600;
		color: #fff;
		background: #18181b;
		border: none;
		border-radius: 0.6rem;
		cursor: pointer;
	}
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid #d4d4d8;
		background: #fafafa;
		cursor: pointer;
		font: inherit;
	}
	.btn.primary {
		background: #18181b;
		color: #fff;
		border-color: #18181b;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.form input,
	.form textarea {
		font: inherit;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d4d4d8;
		border-radius: 0.5rem;
	}
	.body.scroll {
		max-height: 40vh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	/* snap points need a tall drawer to have something to reveal */
	.body.tall {
		min-height: 75vh;
	}
	:global([data-drawer].drawer-panel) {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1rem 1.5rem 2rem;
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.16);
	}
	:global([data-drawer-direction="left"].drawer-panel),
	:global([data-drawer-direction="right"].drawer-panel) {
		width: min(24rem, 90vw);
	}
</style>
