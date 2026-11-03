<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy, onMount } from "svelte";
  import { slide } from "svelte/transition";
  import IslandExtras from "./IslandExtras.svelte";
  import { untrack } from "svelte";
  import { mouseState, players, notifications } from "../state/getters.svelte.ts";
  import type { AppNotification } from "@seelen-ui/lib/types";
  import { SeelenWegSide } from "@seelen-ui/lib/types";
  import Icon from "libs/ui/svelte/components/Icon/Icon.svelte";
  import { desktopPreferences } from "../state/preferences.svelte.ts";
  import { islandState } from "../state/island.svelte.ts";
  import { systemState } from "../state/system.svelte.ts";
  import { t } from "../i18n/index.ts";

  let { enabled = true } = $props<{ enabled?: boolean }>();
  const preferences = $derived(desktopPreferences.value);

  type LyricLine = { time: number; text: string };
  const qqSession = $derived(players.value.find((s) => {
    const identity = `${s.owner.name} ${s.umid}`.toLocaleLowerCase();
    return /(^|[\\/\s._-])qq\s?music([\\/\s._-]|$)|qq音乐/.test(identity);
  }));
  const primary = $derived(systemState.currentMonitor.isPrimary);
  const title = $derived(qqSession?.title || "");
  const author = $derived(qqSession?.author || "");
  const playing = $derived(qqSession?.playing === true);
  const qqSessionKey = $derived.by(() => {
    const session = qqSession;
    return `${session?.umid || ""}:${session?.title || ""}:${session?.author || ""}`;
  });
  let lyricLines = $state<LyricLine[]>([]);
  let playbackTime = $state(0);
  let alert = $state<{ app: string; text: string; notification?: AppNotification } | null>(null);
  let initializedNotifications = false;
  let knownNotifications = new Set<number>();
  let alertTimer: ReturnType<typeof setTimeout> | undefined;
  let expanded = $state(false);
  let revealed = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let interacting = false;
  let composing = false;
  let hovered = false;
  let gestureStart: number | null = null;
  let dragged = false;
  let now = $state(new Date());
  let lyricElement = $state<HTMLElement | null>(null);
  let lyricOverflowing = $state(false);
  let lyricDistance = $state(0);
  const clock = $derived(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
  const date = $derived(now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }));
  const idle = $derived(!playing && alert === null);
  const showing = $derived(enabled && primary && preferences.islandEnabled && !islandState.manuallyHidden &&
    (!preferences.islandAutoHide || revealed || alert !== null || (preferences.showWhilePlaying && playing)));
  const active = $derived(playing || alert !== null || expanded);
  function notify(app: string, text: string, force = false) {
    if (!force && !preferences.volumeAlerts) return;
    alert = { app, text };
    islandState.showManually();
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { alert = null; }, 3500);
  }
  function leave() {
    hovered = false;
    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);
    // Adapted from Fly Island useIdleTuck: defer collapse while a pointer or
    // IME composition is active, and restart after interaction finishes.
    hideTimer = setTimeout(() => {
      if (interacting || composing || mouseState.isDragging) { leave(); return; }
      expanded = false; revealed = false;
    }, preferences.autoHideDelay);
  }
  function enter() {
    hovered = true;
    clearTimeout(hideTimer); clearTimeout(hoverTimer); revealed = true;
    if (preferences.islandHoverExpand) hoverTimer = setTimeout(() => { expanded = true; }, 260);
  }
  function interactionEnd() { interacting = false; if (!hovered) leave(); }
  function hide() {
    clearTimeout(hideTimer); clearTimeout(alertTimer);
    expanded = false; revealed = false; alert = null; islandState.hideManually();
  }
  function pointerDown(event: PointerEvent) {
    clearTimeout(hoverTimer);
    gestureStart = event.clientY; dragged = false;
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (gestureStart !== null && event.clientY - gestureStart < -24) { dragged = true; hide(); }
  }
  async function activate() {
    clearTimeout(hoverTimer);
    clearTimeout(hideTimer);
    if (dragged) { dragged = false; return; }
    if (alert?.notification) {
      const n = alert.notification;
      try {
        await invoke("activate_notification", { id: n.id, umid: n.appUmid, args: n.content["@launch"] || "", activationType: n.content["@activationType"], inputData: {} });
        alert = null; expanded = false; revealed = false;
      } catch {
        await invoke("trigger_widget", { payload: { id: "@seelen/notifications" } }).catch(console.error);
      }
    } else { expanded = !expanded; revealed = true; }
  }
  $effect(() => {
    if (systemState.mouseAtEdge === SeelenWegSide.Top && enabled && preferences.islandEnabled && preferences.topOffset < 64) {
      untrack(() => { islandState.showManually(); enter(); leave(); });
    }
  });
  onMount(() => {
    // The idle clock wakes only at minute boundaries; lyrics retain their own on-demand timer.
    let timer: ReturnType<typeof setTimeout>;
    function tick() { now = new Date(); timer = setTimeout(tick, 60000 - Date.now() % 60000); }
    tick();
    window.addEventListener("pointerup", interactionEnd);
    window.addEventListener("pointercancel", interactionEnd);
    const drop = () => { islandState.showManually(); revealed = true; expanded = true; };
    const drag = (event: Event) => {
      if (!(event as CustomEvent<boolean>).detail) return;
      clearTimeout(hideTimer);
      islandState.showManually();
      revealed = true;
      expanded = true;
    };
    window.addEventListener("island-files", drop);
    window.addEventListener("island-files-drag", drag);
    return () => { clearTimeout(timer); window.removeEventListener("pointerup", interactionEnd); window.removeEventListener("pointercancel", interactionEnd); window.removeEventListener("island-files", drop); window.removeEventListener("island-files-drag", drag); };
  });
  $effect(() => { if (!showing) expanded = false; });
  const currentLyric = $derived.by(() => {
    let index = -1;
    for (let i = 0; i < lyricLines.length; i += 1) {
      if (lyricLines[i]!.time > playbackTime) break;
      index = i;
    }
    return index >= 0 ? lyricLines[index]?.text || title : title;
  });
  const currentLyricIndex = $derived.by(() => {
    let index = -1;
    for (let i = 0; i < lyricLines.length; i += 1) {
      if (lyricLines[i]!.time > playbackTime) break;
      index = i;
    }
    return index;
  });
  const lyricProgress = $derived.by(() => {
    if (!playing || currentLyricIndex < 0) return 0;
    const current = lyricLines[currentLyricIndex];
    if (!current) return 0;
    const next = lyricLines[currentLyricIndex + 1];
    const end = next?.time ?? current.time + 5;
    return Math.max(0, Math.min(1, (playbackTime - current.time) / Math.max(0.1, end - current.time)));
  });

  $effect(() => {
    const node = lyricElement;
    const text = playing ? (lyricLines.length ? currentLyric : title) : "";
    if (!node || !text) {
      lyricOverflowing = false;
      lyricDistance = 0;
      return;
    }

    const viewport = node.parentElement;
    if (!viewport) return;

    const measure = () => {
      const contentWidth = node.scrollWidth;
      const distance = Math.max(0, contentWidth - viewport.clientWidth);
      lyricDistance = distance;
      lyricOverflowing = distance > 2;
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  });

  function parseLrc(raw: string): LyricLine[] {
    const result: LyricLine[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const text = line.replace(/\[[^\]]*\]/g, "").replace(/\(\d+,\d+\)/g, "").trim();
      if (!text) continue;
      let matched = false;
      for (const tag of line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)) {
        matched = true;
        result.push({ time: Number(tag[1]) * 60 + Number(tag[2]) + Number(`0.${tag[3] || "0"}`), text });
      }
      // Keep a frontend fallback for raw QQ QRC responses in case the service
      // returns them before the backend normalizer has a chance to run.
      if (!matched) {
        for (const tag of line.matchAll(/^\[(\d+),(\d+)\]/g)) {
          result.push({ time: Number(tag[1]) / 1000, text });
        }
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }

  $effect(() => {
    if (primary) islandState.visible = showing;
  });

  $effect(() => {
    const songTitle = title;
    const songAuthor = author;
    if (!enabled || !primary || !preferences.islandEnabled || !playing || !songTitle) {
      lyricLines = [];
      return;
    }
    let cancelled = false;
    lyricLines = [];
    invoke("get_qq_lyrics", { title: songTitle, author: songAuthor }).then((raw) => {
      if (cancelled) return;
      lyricLines = typeof raw === "string" ? parseLrc(raw) : [];
    }).catch(() => {
      if (!cancelled) lyricLines = [];
    });
    return () => { cancelled = true; };
  });

  $effect(() => {
    const sessionPlaying = playing;
    const sessionKey = qqSessionKey;
    const nativePosition = () => untrack(() => (qqSession?.timeline.position || 0) / 1_000_000_000);
    playbackTime = nativePosition();
    if (!enabled || !primary || !sessionPlaying || !showing || !sessionKey) return;

    let basePosition = nativePosition();
    let anchor = performance.now();
    let lastNativePosition = basePosition;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      const latestPosition = nativePosition();
      // Re-anchor after a seek or a native player jump without restarting the
      // animation on every media-session update.
      if (latestPosition !== lastNativePosition && Math.abs(latestPosition - basePosition - (now - anchor) / 1000) > 0.75) {
        basePosition = latestPosition;
        anchor = now;
      }
      lastNativePosition = latestPosition;
      playbackTime = basePosition + (now - anchor) / 1000;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    const list = notifications.value;
    const ids = new Set(list.map((n) => n.id));
    const wasInitialized = initializedNotifications;
    if (wasInitialized && primary && preferences.showNotifications) {
      const newest = list.filter((n) => !knownNotifications.has(n.id) && Date.now() - n.date < 15_000)
        .sort((a, b) => b.date - a.date)[0];
      if (newest) {
        const text = newest.content.visual.binding.$value
          .flatMap((entry) => "text" in entry ? [entry.text.$value] : []).join(" · ");
        islandState.showManually();
        alert = { app: newest.appName, text, notification: newest };
        clearTimeout(alertTimer);
        alertTimer = setTimeout(() => { alert = null; }, 5000);
      }
    }
    knownNotifications = ids;
    initializedNotifications = true;
  });

  function portal(element: HTMLElement) {
    document.body.appendChild(element);
    return () => element.remove();
  }

  onDestroy(() => {
    clearTimeout(alertTimer);
    clearTimeout(hideTimer);
    clearTimeout(hoverTimer);
    if (primary) islandState.visible = false;
  });
</script>

{#if enabled && primary && preferences.islandEnabled}
  {#if preferences.filesEnabled}
    <div
      class="qq-island-drop-sensor"
      data-dragging={mouseState.isDragging}
      style={`--island-width:${preferences.islandWidth}px;--island-top:${preferences.topOffset}px`}
      aria-hidden="true"
      {@attach portal}
    ></div>
  {/if}
  <div class="qq-island" hidden={!showing} data-theme={preferences.islandTheme} data-expanded={expanded} data-active={active} data-files-enabled={preferences.filesEnabled} style={`--island-width:${preferences.islandWidth}px;--island-font-size:${preferences.lyricFontSize}px;--island-top:${preferences.topOffset}px;--island-opacity:${preferences.islandOpacity / 100}`} {@attach portal} role="region" aria-label={$t("island.tools")} onpointerenter={enter} onpointerleave={leave} onpointerdown={() => { interacting = true; clearTimeout(hideTimer); }} oncompositionstart={() => { composing = true; }} oncompositionend={() => { composing = false; if (!hovered) leave(); }}>
    <div class="island-header" role="button" tabindex="0" aria-expanded={expanded} onclick={() => void activate()} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void activate(); } if (e.key === "Escape") hide(); }} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={() => { gestureStart = null; }} onpointercancel={() => { gestureStart = null; }}>
    <time class="island-clock" class:idle-clock={idle}>{preferences.clockVisible && !idle ? clock : ""}</time>
    <div class="qq-island-content">
      {#if alert}
        <strong>{alert.app}</strong><span>{alert.text}</span>
      {:else if idle}
        {#if preferences.clockVisible}<time class="island-idle-time">{clock}</time>{/if}
        {#if preferences.dateVisible}<time class="island-date">{date}</time>{/if}
        {#if !preferences.clockVisible && !preferences.dateVisible}<strong>{preferences.name}</strong>{/if}
      {:else}
        <div
          class="lyric-viewport"
          class:lyric-overflow={lyricOverflowing}
          style={`--lyric-shift:${-lyricDistance}px;--lyric-duration:${Math.max(7, Math.min(20, lyricDistance / 18))}s;--lyric-progress:${lyricProgress * 100}%`}
        >
          <strong bind:this={lyricElement} class="lyric-line" class:lyric-playing={playing && lyricLines.length > 0}>{playing ? (lyricLines.length ? currentLyric : title) : preferences.name}</strong>
        </div>
        {#if playing && lyricLines.length > 0}
          <span class="lyric-progress-track" style={`--lyric-progress-scale:${lyricProgress}`} aria-hidden="true"><span></span></span>
        {/if}
        {#if playing && preferences.showArtist}<span>{author}</span>{/if}
      {/if}
    </div>
    <Icon name={alert?.notification ? "LuMessageCircle" : expanded ? "LuChevronUp" : "LuChevronDown"} class="island-chevron" />
    </div>
    {#if expanded && qqSession}
      <div class="island-player" transition:slide={{ duration: 160 }}>
        <div class="island-controls">
          <button data-skin="transparent" aria-label={$t("island.previous")} onclick={() => invoke("media_prev", { id: qqSession!.umid })}><Icon name="LuSkipBack" /></button>
          <button data-skin="transparent" aria-label={$t("island.play_pause")} onclick={() => invoke("media_toggle_play_pause", { id: qqSession!.umid })}><Icon name={playing ? "LuPause" : "LuPlay"} /></button>
          <button data-skin="transparent" aria-label={$t("island.next")} onclick={() => invoke("media_next", { id: qqSession!.umid })}><Icon name="LuSkipForward" /></button>
        </div>
        <input data-skin="flat" data-size="compact" type="range" aria-label={$t("island.seek")} min="0" max={Math.max(1, qqSession.timeline.end / 1e9)} value={playbackTime} onchange={(e) => invoke("media_seek", { id: qqSession!.umid, position: Math.round(Number(e.currentTarget.value) * 1e9) })} />
      </div>
    {/if}
    <IslandExtras {expanded} {notify} />
  </div>
{/if}

<style>
  .qq-island {
    position: fixed;
    top: var(--island-top);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    width: min(var(--island-current-width, var(--island-width)), calc(100vw - 32px));
    pointer-events: auto;
  }
  .qq-island-drop-sensor { position: fixed; top: max(0px, calc(var(--island-top) - 32px)); left: 50%; z-index: 19; width: min(var(--island-width), calc(100vw - 32px)); height: 292px; transform: translateX(-50%); pointer-events: none; }
  .qq-island-drop-sensor { height: 4px; top: var(--island-top); pointer-events: auto; }
  .qq-island-drop-sensor[data-dragging="true"] { height: 320px; }
  .island-header { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; align-items: center; min-height: 34px; touch-action: none; cursor: grab; }
  .island-header :global(.island-chevron) { justify-self: end; }
  .qq-island-content { min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .qq-island-content > * { max-width: 100%; }
  .lyric-viewport { min-width: 0; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .lyric-line { display: inline-block; max-width: 100%; overflow: hidden; color: var(--slu-std-fg-color); text-overflow: ellipsis; white-space: nowrap; }
  .lyric-line.lyric-playing { background: linear-gradient(90deg, var(--system-accent-light-color, #4da3ff) 0 var(--lyric-progress, 0%), var(--slu-std-fg-color) var(--lyric-progress, 0%) 100%); background-clip: text; -webkit-background-clip: text; color: transparent; will-change: background; }
  .lyric-progress-track { display: block; width: min(100%, 180px); height: 2px; margin-top: 2px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--slu-std-fg-color) 22%, transparent); }
  .lyric-progress-track > span { display: block; width: 100%; height: 100%; transform: scaleX(var(--lyric-progress-scale, 0)); transform-origin: left center; background: var(--system-accent-light-color, #4da3ff); will-change: transform; }
  .lyric-viewport.lyric-overflow .lyric-line { max-width: none; overflow: visible; text-overflow: clip; animation: qq-lyric-marquee var(--lyric-duration, 9s) ease-in-out infinite alternate; will-change: transform; }
  .island-idle-time { font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .island-date { color: var(--slu-std-fg-secondary-color); font-size: 0.72rem; line-height: 1.2; }
  .island-clock.idle-clock { visibility: hidden; }
  .island-player input { width: 100%; }
  .island-controls { display: flex; justify-content: center; }
  @keyframes qq-lyric-marquee {
    0%, 24% { transform: translateX(0); }
    76%, 100% { transform: translateX(var(--lyric-shift, 0px)); }
  }
</style>
