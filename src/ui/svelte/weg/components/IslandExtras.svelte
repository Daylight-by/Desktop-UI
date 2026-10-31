<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { subscribe, SeelenEvent } from "@seelen-ui/lib";
  import type { Battery, BluetoothDevice, ClipboardEntry, MediaDevice } from "@seelen-ui/lib/types";
  import { monitors } from "../state/getters.svelte.ts";
  import { t } from "../i18n/index.ts";
  import Icon from "libs/ui/svelte/components/Icon/Icon.svelte";
  import { desktopPreferences } from "../state/preferences.svelte.ts";
  import { systemState } from "../state/system.svelte.ts";
  import CountdownPanel from "./CountdownPanel.svelte";
  import PomodoroPanel from "./PomodoroPanel.svelte";
  import WeatherPanel from "./WeatherPanel.svelte";
  import HardwarePanel from "./HardwarePanel.svelte";
  import WaveformPanel from "./WaveformPanel.svelte";

  let { expanded, notify }: { expanded: boolean; notify: (app: string, text: string, force?: boolean) => void } = $props();
  let tab = $state("");
  const preferences = $derived(desktopPreferences.value);
  let devices = $state<BluetoothDevice[]>([]);
  let levels = $state<Record<string, number | null>>({});
  let clipboard = $state<Pick<ClipboardEntry, "id" | "content">[]>([]);
  let files = $state<string[]>([]);
  let fileDrag = $state(false);
  let error = $state("");
  let ready = false;
  let previousVolume = "";
  let previousBrightness: number | null | undefined;
  let previousDevices = new Map<string, boolean>();
  let warned = new Set<string>();
  const toolTabs = $derived([
    ...(preferences.bluetoothEnabled ? [{ key: "devices", text: "island.bluetooth", icon: "LuBluetooth" as const }] : []),
    ...(preferences.clipboardEnabled ? [{ key: "clipboard", text: "island.clipboard", icon: "LuClipboard" as const }] : []),
    ...(preferences.filesEnabled ? [{ key: "files", text: "island.files", icon: "LuFolder" as const }] : []),
    ...(preferences.countdownEnabled ? [{ key: "countdown", text: "island.countdown", icon: "LuTimer" as const }] : []),
    ...(preferences.pomodoroEnabled ? [{ key: "pomodoro", text: "island.pomodoro", icon: "LuClock" as const }] : []),
    ...(preferences.weatherEnabled ? [{ key: "weather", text: "island.weather", icon: "LuCloudSun" as const }] : []),
    ...(preferences.hardwareEnabled ? [{ key: "hardware", text: "island.hardware", icon: "LuCpu" as const }] : []),
    ...(preferences.waveformEnabled ? [{ key: "waveform", text: "island.waveform", icon: "LuActivity" as const }] : []),
  ]);
  $effect(() => { if (!expanded || !toolTabs.some((tool) => tool.key === tab)) tab = ""; });
  function popup(id: string, element: HTMLElement) {
    const r = element.getBoundingClientRect();
    const m = systemState.currentMonitor.rect;
    void invoke("trigger_widget", { payload: { id, desiredPosition: { x: m.left + Math.round((r.left + r.width / 2) * devicePixelRatio), y: m.top + Math.round((r.bottom + 8) * devicePixelRatio) }, alignX: "Center", alignY: "Start" } }).catch(() => { error = $t("island.unavailable"); });
  }

  function media(data: [MediaDevice[], MediaDevice[]]) {
    const output = data[1].find((d) => d.isDefaultMultimedia);
    if (!output) return;
    const value = `${Math.round(output.volume * 100)}:${output.muted}`;
    if (previousVolume && value !== previousVolume) notify($t("island.volume"), output.muted ? $t("island.muted") : `${Math.round(output.volume * 100)}%`);
    previousVolume = value;
  }

  async function bluetooth(list: BluetoothDevice[]) {
    for (const device of list) {
      if (ready && (previousDevices.get(device.id) || false) !== device.connected)
        notify(device.name, $t(device.connected ? "island.connected" : "island.disconnected"));
    }
    for (const [id, connected] of previousDevices) {
      if (ready && connected && !list.some((device) => device.id === id)) {
        const previous = devices.find((device) => device.id === id);
        if (previous) notify(previous.name, $t("island.disconnected"));
      }
    }
    previousDevices = new Map(list.map((d) => [d.id, d.connected]));
    devices = list.filter((d) => d.connected);
    ready = true;
    for (const device of devices) {
      const level = await invoke<number | null>("get_bluetooth_device_battery", { id: device.id }).catch(() => null);
      levels = { ...levels, [device.id]: level };
      if (level !== null && level <= 20 && !warned.has(device.id)) {
        warned.add(device.id); notify(device.name, `${$t("island.low_battery")} · ${level}%`);
      } else if (level !== null && level > 25) warned.delete(device.id);
    }
  }

  $effect(() => {
    const value = monitors.value.find((m) => m.isPrimary)?.brightness;
    if (value != null && previousBrightness != null && value !== previousBrightness) notify($t("island.brightness"), `${value}%`);
    previousBrightness = value;
  });

  $effect(() => {
    if (!expanded || tab !== "clipboard") { clipboard = []; return; }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    subscribe(SeelenEvent.ClipboardDataChanged, (event) => {
      if (!cancelled) clipboard = event.payload.history.slice(0, 8).map(({ id, content }) => ({ id, content }));
    }).then((u) => { if (cancelled) u(); else unsubscribe = u; }).catch(console.error);
    invoke<{ history: ClipboardEntry[] }>("clipboard_get_data").then((data) => {
      if (!cancelled) clipboard = data.history.slice(0, 8).map(({ id, content }) => ({ id, content }));
    }).catch(() => { if (!cancelled) error = $t("island.unavailable"); });
    return () => { cancelled = true; unsubscribe?.(); };
  });

  function batteries(list: Battery[]) {
    for (const battery of list) {
      const key = `pc:${battery.serialNumber || battery.model || "battery"}`;
      if (battery.percentage <= 20 && battery.state.toLowerCase() === "discharging" && !warned.has(key)) {
        warned.add(key); notify($t("island.low_battery"), `${Math.round(battery.percentage)}%`);
      } else if (battery.percentage > 25) warned.delete(key);
    }
  }

  async function saveFiles(next: string[]) {
    files = [...new Set(next)].slice(0, 40);
    await invoke("write_data_file", { filename: "island-shelf.json", content: JSON.stringify(files) }).catch(() => { error = $t("island.unavailable"); });
  }
  async function addFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ multiple: true });
    if (chosen) await saveFiles([...files, ...(Array.isArray(chosen) ? chosen : [chosen])]);
  }
  function drop(event: Event) {
    tab = "files";
    saveFiles([...files, ...(event as CustomEvent<string[]>).detail]);
  }
  function dragOver(event: Event) {
    fileDrag = (event as CustomEvent<boolean>).detail;
    if (fileDrag) {
      tab = "files";
      error = "";
    }
  }
  function name(path: string) { return path.split(/[\\/]/).pop() || path; }

  onMount(() => {
    let alive = true;
    const unlisteners: (() => void)[] = [];
    const register = (p: Promise<() => void>) => p.then((u) => { if (alive) unlisteners.push(u); else u(); }).catch(console.error);
    register(subscribe(SeelenEvent.MediaDevices, (e) => media(e.payload)));
    register(subscribe(SeelenEvent.BluetoothDevicesChanged, (e) => { void bluetooth(e.payload); }));
    register(subscribe(SeelenEvent.BatteriesStatus, (e) => batteries(e.payload)));
    invoke<[MediaDevice[], MediaDevice[]]>("get_media_devices").then((d) => { if (alive && !previousVolume) media(d); }).catch(() => {});
    invoke<BluetoothDevice[]>("get_bluetooth_devices").then((d) => { if (alive) void bluetooth(d); }).catch(() => {});
    invoke<Battery[]>("get_batteries").then((list) => { if (alive) batteries(list); }).catch(() => {});
    invoke<string>("read_data_file", { filename: "island-shelf.json" }).then((raw) => {
      const data = JSON.parse(raw); if (alive && Array.isArray(data)) files = data.filter((p) => typeof p === "string").slice(0, 40);
    }).catch(() => {});
    window.addEventListener("island-files", drop);
    window.addEventListener("island-files-drag", dragOver);
    // Cached device battery readings need only minute-scale refresh, and only while connected.
    const batteryTimer = setInterval(() => {
      if (devices.length) invoke<BluetoothDevice[]>("get_bluetooth_devices").then((list) => { if (alive) void bluetooth(list); }).catch(() => {});
    }, 60000);
    return () => { alive = false; clearInterval(batteryTimer); unlisteners.forEach((u) => u()); window.removeEventListener("island-files", drop); window.removeEventListener("island-files-drag", dragOver); };
  });
</script>

{#if expanded}
  <nav class="island-tabs" aria-label={$t("island.tools")}>
    {#if preferences.networkEnabled}<button data-skin="transparent" title={$t("island.network")} onclick={(e) => popup("@seelen/network-popup", e.currentTarget)}><Icon name="LuWifi" /><span>{$t("island.network")}</span></button>{/if}
    {#each toolTabs as item}
      <button data-skin="transparent" data-active={tab === item.key} onclick={() => { tab = tab === item.key ? "" : item.key; error = ""; }}><Icon name={item.icon} /><span>{$t(item.text)}</span></button>
    {/each}
    <button data-skin="transparent" title={$t("island.settings")} onclick={() => invoke("trigger_widget", { payload: { id: "@seelen/settings" } })}><Icon name="LuSettings2" /></button>
  </nav>
  {#if tab && tab !== "countdown" && tab !== "pomodoro"}
  <div class="island-tool-body" data-file-dragging={fileDrag && tab === "files"}>
    {#if tab === "devices"}
      {#each devices as device (device.id)}
        <div class="island-file-row"><span>{device.name}</span><span>{levels[device.id] != null ? `${levels[device.id]}%` : $t("island.battery_unknown")}</span></div>
      {:else}<p>{$t("island.no_devices")}</p>{/each}
      <button data-skin="transparent" onclick={(e) => popup("@seelen/bluetooth-popup", e.currentTarget)}>{$t("settings.bluetooth")} <Icon name="LuChevronRight" /></button>
    {:else if tab === "clipboard"}
      {#each clipboard as entry (entry.id)}
        <button class="island-clip" data-skin="transparent" onclick={() => invoke("clipboard_set_content", { id: entry.id }).catch(() => { error = $t("island.unavailable"); })}>
          {#if entry.content.bitmap}<img src={`data:image/webp;base64,${entry.content.bitmap}`} alt={$t("island.clipboard")} />{/if}
          <span>{entry.content.text?.slice(0, 240) || entry.content.files?.map(name).join(", ") || $t("island.clipboard")}</span>
        </button>
      {:else}<p>{$t("island.empty_clipboard")}</p>{/each}
    {:else if tab === "files"}
      <button data-skin="default" onclick={() => void addFiles()}>{$t("island.add_files")}</button>
      <p>{$t("island.files_hint")}</p>
      {#each files as file (file)}
        <div class="island-file-row"><button data-skin="transparent" title={file} onclick={() => invoke("open_file", { path: file }).catch(() => { error = $t("island.file_missing"); })}>{name(file)}</button><button data-skin="transparent" title={$t("island.remove")} onclick={() => void saveFiles(files.filter((f) => f !== file))}>×</button></div>
      {/each}
    {:else if tab === "weather"}
      <WeatherPanel />
    {:else if tab === "hardware"}
      <HardwarePanel />
    {:else if tab === "waveform"}
      <WaveformPanel />
    {/if}
    {#if error}<p role="status">{error}</p>{/if}
  </div>
  {/if}
{/if}
<CountdownPanel active={expanded && tab === "countdown"} {notify} />
<PomodoroPanel active={expanded && tab === "pomodoro"} {notify} />
