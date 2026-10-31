<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../i18n/index.ts";

  let { active, notify }: { active: boolean; notify: (app: string, text: string, force?: boolean) => void } = $props();
  const STORAGE_KEY = "desktop-ui-pomodoro-v1";
  let workMinutes = $state(25);
  let breakMinutes = $state(5);
  let phase = $state<"work" | "break">("work");
  let completed = $state(0);
  let remainingMs = $state(0);
  let endAt = $state(0);
  let running = $state(false);
  const display = $derived.by(() => {
    const total = Math.max(0, Math.ceil(remainingMs / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ workMinutes, breakMinutes, phase, completed, remainingMs, endAt, running })); } catch { /* storage may be unavailable */ }
  }

  function nextPhase() {
    if (phase === "work") {
      completed += 1;
      phase = "break";
      notify($t("island.pomodoro"), $t("island.work_done"), true);
    } else {
      phase = "work";
      notify($t("island.pomodoro"), $t("island.break_done"), true);
    }
    remainingMs = (phase === "work" ? workMinutes : breakMinutes) * 60_000;
    endAt = Date.now() + remainingMs;
    save();
  }

  function tick() {
    if (!running) return;
    remainingMs = Math.max(0, endAt - Date.now());
    if (remainingMs <= 0) nextPhase();
  }

  function toggle() {
    if (running) {
      remainingMs = Math.max(0, endAt - Date.now());
      running = false;
      endAt = 0;
    } else {
      if (remainingMs <= 0) remainingMs = (phase === "work" ? workMinutes : breakMinutes) * 60_000;
      endAt = Date.now() + remainingMs;
      running = true;
    }
    save();
  }

  function setDuration(which: "work" | "break", value: number) {
    const next = Math.min(120, Math.max(1, Math.round(value) || 1));
    if (which === "work") workMinutes = next;
    else breakMinutes = next;
    if (!running) remainingMs = 0;
    save();
  }

  function reset() {
    running = false;
    phase = "work";
    completed = 0;
    remainingMs = 0;
    endAt = 0;
    save();
  }

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Number.isFinite(saved?.workMinutes)) workMinutes = Math.min(120, Math.max(1, Math.round(saved.workMinutes)));
      if (Number.isFinite(saved?.breakMinutes)) breakMinutes = Math.min(120, Math.max(1, Math.round(saved.breakMinutes)));
      if (saved?.phase === "work" || saved?.phase === "break") phase = saved.phase;
      if (Number.isFinite(saved?.completed)) completed = Math.max(0, Math.round(saved.completed));
      if (saved?.running && Number.isFinite(saved.endAt)) {
        endAt = saved.endAt;
        remainingMs = Math.max(0, endAt - Date.now());
        running = remainingMs > 0;
        if (!running) {
          if (phase === "work") { completed += 1; phase = "break"; notify($t("island.pomodoro"), $t("island.work_done"), true); }
          else { phase = "work"; notify($t("island.pomodoro"), $t("island.break_done"), true); }
          endAt = 0;
          save();
        }
      } else if (Number.isFinite(saved?.remainingMs)) remainingMs = Math.max(0, saved.remainingMs);
    } catch { /* start with a fresh timer if stored state is malformed */ }
  });

  $effect(() => {
    if (!running) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  });
</script>

<div class="island-tool-body productivity-panel" hidden={!active}>
  <h3>{$t("island.pomodoro")}</h3>
  <span class="pomodoro-phase">{$t(phase === "work" ? "island.work" : "island.break")}</span>
  <strong class="productivity-time">{display}</strong>
  <div class="pomodoro-durations">
    <label><span>{$t("island.work")}</span><input data-skin="default" type="number" min="1" max="120" value={workMinutes} disabled={running} onchange={(event) => setDuration("work", Number(event.currentTarget.value))} /></label>
    <label><span>{$t("island.break")}</span><input data-skin="default" type="number" min="1" max="120" value={breakMinutes} disabled={running} onchange={(event) => setDuration("break", Number(event.currentTarget.value))} /></label>
  </div>
  <p>{$t("island.sessions")}: {completed}</p>
  <div class="productivity-actions">
    <button data-skin="default" onclick={toggle}>{running ? $t("island.pause") : remainingMs > 0 ? $t("island.resume") : $t("island.start")}</button>
    <button data-skin="transparent" onclick={reset}>{$t("island.reset")}</button>
  </div>
</div>
