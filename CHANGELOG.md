# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0 — 2026-07-20

A rebuild of the drawer's motion and gesture core on a declarative model (CSS
transitions + data attributes + CSS variables), replacing the previous
keyframe/imperative approach. The result is interruptible by construction and
themeable; several correctness bugs surfaced by an adversarial review are fixed.

### Breaking

- **Enter/exit is now a CSS transition, not a keyframe.** All
  `@keyframes svaul-drawer-*` were removed. Open/close/drag are driven by
  `data-state`, a transient `data-svaul-drawer-starting` frame, and a
  `transform` transition whose duration is `--svaul-drawer-duration`. Custom CSS
  that targeted the old keyframes no longer applies — override the transition or
  the duration variable instead. Because it's a transition, any close can now be
  interrupted and reversed from its live position.
- **Every close is interruptible and swipe-closes are velocity-scaled by
  default.** The previous experimental flags are gone; this is the standard
  behavior.
- **Removed the `scrollLockTimeout` prop** and the post-open / post-scroll
  drag-lock timers. A drag is available immediately after open; the scroll-vs-drag
  decision is now purely structural.
- **Background scale + nested recede are a stylesheet contract.** The library no
  longer writes inline `transform`/`filter`, and no longer overwrites
  `document.body.style.background`. It publishes state instead — `--svaul-scale-open`,
  `--svaul-scale-factor`, `--svaul-scale-levels`, `--svaul-scale-radius`,
  `data-svaul-drawer-scaled`, `data-svaul-drawer-scale-direction`, and (for nested
  parents) `--svaul-nested-scale`/`--svaul-nested-lift` under
  `data-svaul-drawer-nested`. The default card-stack look ships in the stylesheet;
  restyle it by overriding those variables/attributes. The page tint is an
  unlayered `body[data-svaul-drawer-scaled] { background: var(--svaul-scale-bg) }`
  rule (opt in via `setBackgroundColorOnScale`).
- **Snap points: a numeric value `> 1` is pixels, not a fraction.** `≤ 1` is still
  a fraction of the extent, so `snapPoints={[0.4, 1]}` is unchanged, but
  `snapPoints={[0.4, 500]}` now means 500px (previously 500× the viewport). Use
  a string (`"500px"`) if you were relying on the old reading.
- **Scroll lock now locks the actual viewport scroller (`<html>`)** in addition to
  `<body>`.
- The live drag offset is applied via the `--svaul-drawer-swipe` variable under
  `data-svaul-drawer-swiping` (non-snap drawers), not an inline `transform`.

### Added

- Velocity-scaled swipe-close: the close duration is derived from the release
  velocity, and a close can be caught and re-opened mid-flight.
- Snap-point values accept `rem`/`vh`/`vw` in addition to fractions, `px`, `%`,
  and `calc()` sums; unresolvable values warn (once) instead of silently
  resolving to 0.

### Fixed

- **Snap:** a fraction/oversized value `> 1` is clamped to the extent instead of
  resting the drawer off-screen; points that resolve to the same offset are
  de-duplicated.
- **Snap:** a release flick that reverses the drag direction (e.g. drag up, flick
  down) no longer throws to the far snap point the wrong way.
- **Dismiss:** a right/middle-click outside a non-modal drawer no longer closes
  it; a drag that begins inside the drawer and releases on the modal backdrop no
  longer dismisses.
- **Reduced motion:** the drawer settles/unmounts immediately under
  `prefers-reduced-motion` instead of lingering for the full transition duration.
- **Drag:** overdragging past fully-open eases smoothly instead of jumping ~16px
  in the closing direction.
- **Gesture:** the scroll-vs-drag gate crosses shadow-DOM boundaries; a drag that
  starts on an `<input type="range">` is left to the slider.
- **keepMounted:** closed content is hidden with `visibility` (so it stays
  measurable) rather than `display: none`.

## 1.2.1

GitHub-only release (not published to npm). Superseded by 2.0.0.
