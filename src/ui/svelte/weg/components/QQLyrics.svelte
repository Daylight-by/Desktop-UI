<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy, onMount } from "svelte";
  import IslandExtras from "./IslandExtras.svelte";
  import { untrack } from "svelte";
  import { players, notifications } from "../state/getters.svelte.ts";
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
  let lyricLines = $state<LyricLine[]>([]);
  let playbackTime = $state(0);
  let alert = $state<{ app: string; text: string; notification?: AppNotification } | null>(null);
  let initializedNotifications = false;
  let knownNotifications = new Set<number>();
  let alertTimer: ReturnType<typeof setTimeout> | undefined;
  let expanded = $state(false);
  let revealed = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let gestureStart: number | null = null;
  let dragged = false;
  let now = $state(new Date());
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
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { expanded = false; revealed = false; }, preferences.autoHideDelay);
  }
  function enter() { clearTimeout(hideTimer); revealed = true; }
  function hide() {
    clearTimeout(hideTimer); clearTimeout(alertTimer);
    expanded = false; revealed = false; alert = null; islandState.hideManually();
  }
  function pointerDown(event: PointerEvent) {
    gestureStart = event.clientY; dragged = false;
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (gestureStart !== null && event.clientY - gestureStart < -24) { dragged = true; hide(); }
  }
  async function activate() {
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
    if (systemState.mouseAtEdge === SeelenWegSide.Top && enabled && preferences.islandEnabled) {
      untrack(() => { islandState.showManually(); enter(); leave(); });
    }
  });
  onMount(() => {
    // The idle clock wakes only at minute boundaries; lyrics retain their own on-demand timer.
    let timer: ReturnType<typeof setTimeout>;
    function tick() { now = new Date(); timer = setTimeout(tick, 60000 - Date.now() % 60000); }
    tick();
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
    return () => { clearTimeout(timer); window.removeEventListener("island-files", drop); window.removeEventListener("island-files-drag", drag); };
  });
  $effect(() => { if (!showing) expanded = false; });
  const currentLyric = $derived.by(() => {
    let line = title;
    for (const entry of lyricLines) {
      if (entry.time > playbackTime) break;
      line = entry.text;
    }
    return line;
  });

  function parseLrc(raw: string): LyricLine[] {
    const result: LyricLine[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const text = line.replace(/\[[^\]]*\]/g, "").trim();
      if (!text) continue;
      for (const tag of line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g)) {
        result.push({ time: Number(tag[1]) * 60 + Number(tag[2]) + Number(`0.${tag[3] || "0"}`), text });
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
    const session = qqSession;
    playbackTime = (session?.timeline.position || 0) / 1_000_000_000;
    if (!enabled || !primary || !session?.playing || !showing) return;
    const anchor = performance.now();
    const position = session.timeline.position / 1_000_000_000;
    playbackTime = position;
    const timer = setInterval(() => { playbackTime = position + (performance.now() - anchor) / 1000; }, 250);
    return () => clearInterval(timer);
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
    if (primary) islandState.visible = false;
  });
</script>

{#if enabled && primary && preferences.islandEnabled}
  <div class="qq-island" hidden={!showing} data-theme={preferences.islandTheme} data-expanded={expanded} data-active={active} data-files-enabled={preferences.filesEnabled} style={`--island-width:${preferences.islandWidth}px;--island-font-size:${preferences.lyricFontSize}px;--island-top:${preferences.topOffset}px;--island-opacity:${preferences.islandOpacity / 100}`} {@attach portal} role="region" aria-label={$t("island.tools")} onpointerenter={enter} onpointerleave={leave}>
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
        <strong>{playing ? (lyricLines.length ? currentLyric : title) : preferences.name}</strong>{#if playing && preferences.showArtist}<span>{author}</span>{/if}
      {/if}
    </div>
    <Icon name={alert?.notification ? "LuMessageCircle" : expanded ? "LuChevronUp" : "LuChevronDown"} class="island-chevron" />
    </div>
    {#if expanded && qqSession}
      <div class="island-player">
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
    width: min(var(--island-width), calc(100vw - 32px));
    pointer-events: auto;
  }
  .island-header { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; align-items: center; min-height: 34px; touch-action: none; cursor: grab; }
  .island-header :global(.island-chevron) { justify-self: end; }
  .qq-island-content { min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .qq-island-content > * { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .island-idle-time { font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .island-date { color: var(--slu-std-fg-secondary-color); font-size: 0.72rem; line-height: 1.2; }
  .island-clock.idle-clock { visibility: hidden; }
  .island-player input { width: 100%; }
  .island-controls { display: flex; justify-content: center; }
</style>
