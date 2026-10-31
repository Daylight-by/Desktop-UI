<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { SeelenCommand, SeelenEvent, subscribe } from "@seelen-ui/lib";
  import { t } from "../i18n/index.ts";

  type Waveform = { samples: number[]; frequencies: number[] };
  let waveform = $state<Waveform | null>(null);
  let error = $state("");
  const path = $derived.by(() => {
    const samples = waveform?.samples;
    if (!samples?.length) return "";
    const points = 64;
    const width = 320;
    const center = 42;
    const amplitude = 34;
    let result = "";
    for (let i = 0; i < points; i++) {
      const index = Math.min(samples.length - 1, Math.floor((i / (points - 1)) * samples.length));
      const y = center - Math.max(-1, Math.min(1, samples[index] || 0)) * amplitude;
      result += `${i === 0 ? "M" : "L"}${(i / (points - 1)) * width},${y} `;
    }
    return result.trim();
  });

  onMount(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    subscribe(SeelenEvent.MediaWaveform, (event) => { if (alive) waveform = event.payload; })
      .then((stop) => { if (alive) unlisten = stop; else stop(); })
      .catch(() => { if (alive) error = $t("island.unavailable"); });
    invoke(SeelenCommand.SetMediaWaveformEnabled, { enabled: true })
      .then(() => invoke<Waveform>(SeelenCommand.GetMediaWaveform))
      .then((data) => { if (alive) waveform = data; })
      .catch(() => { if (alive) error = $t("island.unavailable"); });
    return () => {
      alive = false;
      unlisten?.();
      void invoke(SeelenCommand.SetMediaWaveformEnabled, { enabled: false }).catch(() => {});
    };
  });
</script>

{#if error}
  <p role="status">{error}</p>
{:else if path}
  <svg class="island-waveform" viewBox="0 0 320 84" role="img" aria-label={$t("island.waveform")}>
    <path d={path}></path>
  </svg>
{:else}
  <p>{$t("island.waveform_waiting")}</p>
{/if}
