import { getRootContainer } from "libs/ui/react/utils/index.ts";
import { mount } from "svelte";
import App from "./App.svelte";
import { SeelenCommand, Widget } from "@seelen-ui/lib";
import { invoke } from "@tauri-apps/api/core";
import { desktopPreferences } from "./state/preferences.svelte.ts";
import { monitors, mousePos } from "./state/getters.svelte.ts";

import "./styles/variables.css";
import "@seelen-ui/lib/styles/reset.css";
import "./styles/global.css";

await Widget.getCurrent().init();

mount(App, {
  target: getRootContainer(),
});

function isScreenIslandPoint(point: { x: number; y: number }): boolean {
  if (!desktopPreferences.value.filesEnabled) return false;
  const monitor = monitors.value.find((item) => item.id === Widget.self.decoded.monitorId) ||
    monitors.value.find((item) => item.isPrimary);
  if (!monitor) return false;
  const scale = monitor.scaleFactor || 1;
  const width = monitor.rect.right - monitor.rect.left;
  const height = monitor.rect.bottom - monitor.rect.top;
  const islandWidth = Math.min(desktopPreferences.value.islandWidth * scale, Math.max(0, width - 32 * scale));
  const left = monitor.rect.left + (width - islandWidth) / 2;
  const top = monitor.rect.top + desktopPreferences.value.topOffset * scale;
  const margin = 48 * scale;
  return point.x >= left - margin && point.x <= left + islandWidth + margin &&
    point.y >= Math.max(monitor.rect.top, top - margin) && point.y <= Math.min(monitor.rect.bottom, top + 320 * scale);
}

let islandDropArmed = false;
let lastEventKey = "";
let lastEventAt = 0;

async function handleDragDrop(e: any) {
  const payload = e.payload;
  const eventPosition = "position" in payload
    ? { x: payload.position.x, y: payload.position.y }
    : null;
  const eventKey = `${payload.type}:${eventPosition?.x ?? ""}:${eventPosition?.y ?? ""}:${payload.paths?.join("\0") || ""}`;
  const now = performance.now();
  // Tauri can deliver the same native drag event to both the Window and the
  // Webview listener.  Ignore only an immediate duplicate; later `over`
  // events are still allowed to refresh the target state.
  if (eventKey === lastEventKey && now - lastEventAt < 80) return;
  lastEventKey = eventKey;
  lastEventAt = now;

  const island = document.querySelector<HTMLElement>(".qq-island");
  const sensor = document.querySelector<HTMLElement>(".qq-island-drop-sensor");
  const positions = eventPosition
    ? [eventPosition, { x: eventPosition.x / devicePixelRatio, y: eventPosition.y / devicePixelRatio }]
    : [];
  const screenPosition = mousePos.value;
  const inIslandDropArea = () => {
    if (!island || island.dataset.filesEnabled !== "true") return false;
    if (isScreenIslandPoint(screenPosition)) return true;
    const rects = [island.getBoundingClientRect(), sensor?.getBoundingClientRect()]
      .filter((rect): rect is DOMRect => !!rect && rect.width > 0 && rect.height > 0);
    if (positions.some(({ x, y }) => rects.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom))) return true;

    // The island is display:none while hidden, so it has no DOM bounds. Keep a narrow
    // top-center reveal target so a file drag can open the shelf before the drop occurs.
    const width = Math.min(Number.parseFloat(island.style.getPropertyValue("--island-width")) || 360, window.innerWidth - 32);
    const top = Number.parseFloat(island.style.getPropertyValue("--island-top")) || 0;
    const left = (window.innerWidth - width) / 2;
    return positions.some(({ x, y }) => x >= left && x <= left + width && y >= Math.max(0, top - 32) && y <= top + 260);
  };
  const isOverTaskbar = () => positions.some(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".taskbar"));

  if (payload.type === "enter" || payload.type === "over") {
    const inArea = inIslandDropArea();
    if (inArea) islandDropArmed = true;
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: inArea || islandDropArmed }));
    return;
  }
  if (payload.type === "leave") {
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
    islandDropArmed = false;
    return;
  }
  if (payload.type === "drop") {
    const acceptForIsland = inIslandDropArea() || islandDropArmed;
    if (acceptForIsland) {
      window.dispatchEvent(new CustomEvent("island-files", { detail: payload.paths }));
      window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
      islandDropArmed = false;
      return;
    }
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
    islandDropArmed = false;
    if (!isOverTaskbar()) return;
    for (const path of payload.paths) {
      await invoke(SeelenCommand.WegPinItem, { path });
    }
  }
}

// Listen at both levels: depending on whether the transparent hitbox has just
// been opened, Windows/Tauri may report the drop to the native Window or only
// to its Webview.  The small duplicate guard above keeps the two streams safe.
await Promise.allSettled([
  Widget.self.webview.onDragDropEvent(handleDragDrop),
  Widget.self.window.onDragDropEvent(handleDragDrop),
]);

// WebView2 can expose a normal DOM drop for some Explorer/browser versions
// instead of emitting Tauri's native event.  Keep a narrow top-center fallback
// so those files still reach the same shelf handler.
window.addEventListener("dragover", (event) => {
  if (!desktopPreferences.value.filesEnabled || !isScreenIslandPoint(mousePos.value)) return;
  event.preventDefault();
  islandDropArmed = true;
  window.dispatchEvent(new CustomEvent("island-files-drag", { detail: true }));
});
window.addEventListener("drop", (event) => {
  if (!desktopPreferences.value.filesEnabled || !isScreenIslandPoint(mousePos.value)) return;
  const paths = Array.from(event.dataTransfer?.files || [])
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => !!path);
  if (!paths.length) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("island-files", { detail: paths }));
  window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
  islandDropArmed = false;
});
