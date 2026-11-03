# Fly Island integration (2026-11-01)

Source: https://github.com/flyl1u/fly-island, snapshot 5e06f7c.
License and attribution: `vendor/fly-island/`.

The existing Tauri runtime now contains adaptations of Fly Island's interaction
guard and waveform envelope, with a token-based glass appearance and expanding
capsule. The React app itself is not embedded and no extra daemon is installed.

- Hover for 260 ms to expand; the existing delay controls collapse after leaving.
- Pointer interaction and IME composition defer collapse. Upward hide remains.
- Playing music still keeps the compact island visible according to the user's setting.
- Glass, classic and transparent presets are available in personal settings.
- Remember/restore stores one personal appearance; Save applies and persists it.
- Messages tab lists up to twelve recent existing Windows notifications and uses
  their original activation action. This is not direct QQ/WeChat chat extraction.
- The waveform page retains the existing system-audio data and adds two upstream-
  inspired curves. Its timer stops on unmount and suppresses animation when hidden
  or reduced motion is requested.

Validation: TypeScript and Svelte checks passed; production frontend and debug
native builds passed; preset round-trip and malformed-input checks passed.
Runtime mouse checks confirmed hover expansion, message navigation, waveform
mount (two ribbons) and collapse/unmount after leaving. Glass blur and viewport
bounds were inspected. Real Explorer file drop reliability remains a separate
outstanding issue, not a claimed result of this port.

Follow-up: added native OLE targets to the overlay root and descendant windows.
A Windows Forms FileDrop/OLE drag integration check then returned Copy and
produced enter/over/drop plus a README.md shelf reference (test reference removed).
This checks the native Windows data path, not a synthetic web event. Explorer
and the app were also confirmed non-elevated. Click now cancels pending hover
expansion; panels slide for 160ms. Recording-safe layout moves the island to
80 logical pixels, disables hover and top-edge activation there, and shrinks
the invisible sensor to 4px. It is a selectable layout preset, not automatic
recognition of whether recording is active.

Previous runtime and personal configuration are backed up under
`migration-backup-20261101-fly-island`. The previous dark appearance is available
through Restore my style in personal settings. No GitHub upload was made.
