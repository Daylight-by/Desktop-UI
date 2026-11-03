# Fly Island adaptations

Source: https://github.com/flyl1u/fly-island, snapshot 5e06f7c.

The Svelte island adapts the pointer/composition-aware idle-collapse behavior from
`src/useIslandAutomation.ts`. Its compact/expanded shape transition and optional
glass styling take inspiration from `src/App.css`. Adaptations use Desktop-UI
theme tokens and its existing Tauri runtime; no additional app process is started.

See LICENSE for the retained upstream MIT notice. No upstream fonts or brand
assets are bundled.
