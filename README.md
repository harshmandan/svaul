<div align="center">

  <img src="./static/favicon.svg" alt="svaul" width="400" />

  <h1>svaul</h1>

[![version](https://img.shields.io/npm/v/@harshmandan/svaul.svg)](https://www.npmjs.com/package/@harshmandan/svaul)
[![downloads](http://img.shields.io/npm/dm/@harshmandan/svaul.svg)](https://www.npmjs.com/package/@harshmandan/svaul)

</div>

An unstyled, **runes-first drawer / bottom-sheet for Svelte 5** — drag-to-dismiss, snap
points, nested drawers, and an accessible dialog core. **Zero runtime dependencies.**

A ground-up Svelte 5 re-imagining of [vaul](https://github.com/emilkowalski/vaul) and
[vaul-svelte](https://github.com/huntabyte/vaul-svelte) (see [Credits](#credits)). See
the advantages over both in the [Why svaul?](#why-svaul) section below.

## Quick start

```sh
npm i @harshmandan/svaul
```

> Requires Svelte `^5`.

```svelte
<script lang="ts">
  import Drawer from "@harshmandan/svaul";
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

To close the drawer on the browser back button, drive `open` yourself and reset it from
`onOpenChange` + a `popstate` listener (svaul intentionally doesn't touch history).

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
`fadeFromIndex`, `snapToSequentialPoint`, `container`, `keepMounted`, `onlyPrimaryPointer`
— see the exported types.

**Snap points** accept fractions (`0.5`), pixels (`"148px"`), percentages (`"50%"`), and
`calc()` combinations: `snapPoints={["calc(50% + 24px)", 1]}`.

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

## Why svaul?

- **Svelte 5 runes-native** — built on `$state`/`$derived`/`$effect`, `{@attach}` attachments
  and snippets, not stores or `$:` side-effect chains.
- **Zero runtime dependencies** — the portal, focus-trap, scroll-lock, dismiss/Escape, `inert`
  background and ARIA are all hand-rolled. (vaul-svelte ships `bits-ui`; vaul is React-only.)
- **Svelte Native API** — a single `<Drawer>` with named snippets *and* a headless `Drawer` class,
  instead of compound `Drawer.Root/Content/…` parts.
- **Bug fixes** Fixes bugs with both vaul and svelte-vaul: ref-counted scroll-lock & background-color
  restore that **always** reverts, **topmost-only** outside-click for nested drawers, the
  on-screen-keyboard "drawer shoots off-screen" fix, **pixel-snapped** snap offsets (no blurry
  text), a dismiss-**blink** fix, `prefers-reduced-motion` honored on the scaled background, and
  `modal` actually wired through. And more.

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
