<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../i18n/index.ts";

  let { active, notify }: { active: boolean; notify: (app: string, text: string, force?: boolean) => void } = $props();
  const STORAGE_KEY = "desktop-ui-countdown-v1";
  let minutes = $state(10);
  let remainingMs = $state(0);
  let endAt = $state(0);
  let running = $state(false);
  const display = $derived.by(() => {
    const total = Math.max(0, Math.ceil(remainingMs / 1000));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  });

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ minutes, remainingMs, endAt, running })); } catch { /* storage may be unavailable */ }
  }

  function finish() {
    running = false;
    remainingMs = 0;
    endAt = 0;
    save();
    notify($t("island.countdown"), $t("island.timer_done"), true);
  }

  function tick() {
    if (!running) return;
    remainingMs = Math.max(0, endAt - Date.now());
    if (remainingMs <= 0) finish();
  }

  function toggle() {
    if (running) {
      remainingMs = Math.max(0, endAt - Date.now());
      running = false;
      endAt = 0;
    } else {
      if (remainingMs <= 0) remainingMs = minutes * 60_000;
      endAt = Date.now() + remainingMs;
      running = true;
    }
    save();
  }

  function setMinutes(value: number) {
    minutes = Math.min(180, Math.max(1, Math.round(value) || 1));
    remainingMs = 0;
    endAt = 0;
    running = false;
    save();
  }

  function reset() {
    running = false;
    remainingMs = 0;
    endAt = 0;
    save();
  }

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Number.isFinite(saved.minutes)) minutes = Math.min(180, Math.max(1, Math.round(saved.minutes)));
      if (saved?.running && Number.isFinite(saved.endAt)) {
        endAt = saved.endAt;
        remainingMs = Math.max(0, endAt - Date.now());
        running = remainingMs > 0;
        if (!running) finish();
      } else if (Number.isFinite(saved?.remainingMs)) {
        remainingMs = Math.max(0, saved.remainingMs);
      }
    } catch { /* start with a fresh timer if stored state is malformed */ }
  });

  $effect(() => {
    if (!running) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  });
</script>

<div class="island-tool-body productivity-panel" hidden={!active}>
  <h3>{$t("island.countdown")}</h3>
  <strong class="productivity-time">{display}</strong>
  <label class="productivity-duration"><span>{$t("island.duration")}</span><input data-skin="default" type="number" min="1" max="180" value={minutes} disabled={running} onchange={(event) => setMinutes(Number(event.currentTarget.value))} /><span>{$t("island.countdown_minutes")}</span></label>
  <div class="productivity-presets">
    {#each [5, 10, 25, 45] as preset}
      <button data-skin="transparent" disabled={running} onclick={() => setMinutes(preset)}>{preset}</button>
    {/each}
  </div>
  <div class="productivity-actions">
    <button data-skin="default" onclick={toggle}>{running ? $t("island.pause") : remainingMs > 0 ? $t("island.resume") : $t("island.start")}</button>
    <button data-skin="transparent" onclick={reset}>{$t("island.reset")}</button>
  </div>
</div>
