# svaul

An unstyled, **runes-first drawer / bottom-sheet for Svelte 5** — drag-to-dismiss, snap
points, nested drawers, and an accessible dialog core. **Zero runtime dependencies.**

A ground-up Svelte 5 re-imagining of [vaul](https://github.com/emilkowalski/vaul) and
[vaul-svelte](https://github.com/huntabyte/vaul-svelte) (see [Credits](#credits)).

```sh
npm i svaul
```

> Requires Svelte `^5`.

## Quick start

```svelte
<script lang="ts">
  import Drawer from "svaul";
  let open = $state(false);
</script>

<Drawer bind:open class="rounded-t-xl bg-white p-4">
  {#snippet trigger(props)}
    <button {...props}>Open</button>
  {/snippet}

  <h2>A bottom sheet</h2>
  <p>Drag it down to dismiss, or tap outside.</p>

  {#snippet footer({ close })}
    <button onclick={close}>Close</button>
  {/snippet}
</Drawer>
```

Every part of the drawer is customizable via **named snippets** in the `<Drawer>` component:
`trigger`, `overlay`, `content`, `handle`, `title`, `description`,
`header`, `footer`, and the default `children` (the scrollable body). Supply only the parts
you want to own; each renders a sensible default otherwise. Body snippets receive
`{ open, close, setOpen, closeAll, cycleSnapPoint }` controls.

## Headless

For total control over the markup, import the reactive `Drawer` class and spread its
attribute bags onto your own elements:

```svelte
<script lang="ts">
  import { Drawer } from "svaul/headless";
  const drawer = new Drawer({ snapPoints: () => [0.5, 1] });
</script>

<button {...drawer.trigger}>Open</button>
{#if drawer.present}
  <div {...drawer.overlay}></div>
  <div {...drawer.content}> … </div>
{/if}
```

## Key props

| Prop | Default | |
|---|---|---|
| `bind:open` | — | controlled/uncontrolled open state (also `onOpenChange`) |
| `direction` | `"bottom"` | `top` · `bottom` · `left` · `right` |
| `snapPoints` | — | fractions (`0.5`) or px (`"148px"`); pair with `bind:activeSnapPoint` |
| `dismissible` | `true` | drag / overlay-click / Escape can close |
| `modal` | `true` | overlay + scroll-lock + focus-trap |
| `scaleBackground` | `false` | scale `[data-drawer-wrapper]` (the card-stack look) |
| `handleOnly` | `false` | only the handle initiates a drag |
| `dragSensitivity` | `1` | `>1` makes the drawer move faster than the cursor |
| `disableAnimation` | `false` | instant open / close |

Plus `closeThreshold`, `repositionInputs`, `preventScrollRestoration`, `noBodyStyles`,
`setBackgroundColorOnScale`, `backgroundColor`, `borderRadius`, `autoFocus`,
`fadeFromIndex`, `snapToSequentialPoint`, `container` — see the exported types.

## Styling

It ships unstyled — bring your own `class`. Everything is reachable via data attributes
(`[data-drawer]`, `[data-drawer-overlay]`, `[data-drawer-handle]`) and CSS variables
(`--drawer-bg`, `--drawer-overlay-bg`, `--drawer-handle-bg`, `--drawer-handle-gap`, …).

The library's own CSS lives in the **`svaul` cascade layer**, so your styles always win
without `!important`. With Tailwind v4, declare the layer order once:

```css
@layer svaul;
@import "tailwindcss";
```

> **`scaleBackground` note:** wrap your page in `<div data-drawer-wrapper>` and give it an
> opaque background. The gap behind the lifted page is painted via `setBackgroundColorOnScale`
> (default black) — if the wrapper is transparent the whole page looks black.

## Credits

This library stands entirely on the shoulders of two projects:

- **[vaul](https://github.com/emilkowalski/vaul)** by [Emil Kowalski](https://emilkowalski.com)
  — the original React drawer. Its drag physics, snap-point math, and the overall feel are
  ported from here.
- **[vaul-svelte](https://github.com/huntabyte/vaul-svelte)** by
  [Huntabyte](https://github.com/huntabyte) — the Svelte port that proved the idea. `svaul`
  is a from-scratch Svelte 5 (runes, zero-dependency) take on the same concept.

Huge thanks to both. ♥

## License

MIT
