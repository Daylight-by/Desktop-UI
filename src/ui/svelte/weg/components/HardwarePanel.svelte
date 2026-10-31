<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { SeelenCommand, SeelenEvent, subscribe } from "@seelen-ui/lib";
  import { t } from "../i18n/index.ts";

  type CoreInfo = { name: string; brand: string; usage: number; frequency: number };
  type MemoryInfo = { total: number; free: number };
  type GpuInfo = { id: string; name: string; usage: number; dedicatedMemoryTotal: number; dedicatedMemoryUsed: number };

  let cores = $state<CoreInfo[]>([]);
  let memory = $state<MemoryInfo | null>(null);
  let gpus = $state<GpuInfo[]>([]);
  let loading = $state(true);
  let error = $state("");
  const cpuUsage = $derived(cores.length ? cores.reduce((sum, core) => sum + core.usage, 0) / cores.length : 0);
  const memoryUsed = $derived(memory ? Math.max(0, memory.total - memory.free) : 0);

  function gib(bytes: number) { return `${(bytes / 1024 ** 3).toFixed(1)} GiB`; }

  onMount(() => {
    let alive = true;
    const unlisteners: (() => void)[] = [];
    const register = (promise: Promise<() => void>) => promise.then((unlisten) => { if (alive) unlisteners.push(unlisten); else unlisten(); }).catch(console.error);
    register(subscribe(SeelenEvent.SystemMemoryChanged, (event) => { memory = event.payload; }));
    register(subscribe(SeelenEvent.SystemCoresChanged, (event) => { cores = event.payload; }));
    register(subscribe(SeelenEvent.SystemGpusChanged, (event) => { gpus = event.payload; }));

    Promise.all([
      invoke<MemoryInfo>(SeelenCommand.GetSystemMemory),
      invoke<CoreInfo[]>(SeelenCommand.GetSystemCores),
      invoke<GpuInfo[]>(SeelenCommand.GetSystemGpus),
    ]).then(([nextMemory, nextCores, nextGpus]) => {
      if (!alive) return;
      memory = nextMemory;
      cores = nextCores;
      gpus = nextGpus;
      loading = false;
    }).catch(() => {
      if (alive) { error = $t("island.unavailable"); loading = false; }
    });

    return () => { alive = false; unlisteners.forEach((unlisten) => unlisten()); };
  });
</script>

{#if loading}
  <p>{$t("island.loading")}</p>
{:else if error}
  <p role="status">{error}</p>
{:else}
  <div class="hardware-metrics">
    <div class="hardware-metric">
      <div><span>{$t("island.cpu")}</span><strong>{cpuUsage.toFixed(0)}%</strong></div>
      <progress max="100" value={cpuUsage}></progress>
    </div>
    {#if memory}
      <div class="hardware-metric">
        <div><span>{$t("island.memory")}</span><strong>{gib(memoryUsed)} / {gib(memory.total)}</strong></div>
        <progress max="100" value={memory.total ? (memoryUsed / memory.total) * 100 : 0}></progress>
      </div>
    {/if}
    {#each gpus as gpu (gpu.id)}
      <div class="hardware-metric">
        <div><span title={gpu.name}>{$t("island.gpu")} · {gpu.name}</span><strong>{gpu.usage.toFixed(0)}%</strong></div>
        <progress max="100" value={gpu.usage}></progress>
        {#if gpu.dedicatedMemoryTotal > 0}<small>{gib(gpu.dedicatedMemoryUsed)} / {gib(gpu.dedicatedMemoryTotal)}</small>{/if}
      </div>
    {:else}
      <p>{$t("island.gpu_unavailable")}</p>
    {/each}
  </div>
{/if}
