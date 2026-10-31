import { getRootContainer } from "libs/ui/react/utils/index.ts";
import { mount } from "svelte";
import App from "./App.svelte";
import { SeelenCommand, Widget } from "@seelen-ui/lib";
import { invoke } from "@tauri-apps/api/core";

import "./styles/variables.css";
import "@seelen-ui/lib/styles/reset.css";
import "./styles/global.css";

await Widget.getCurrent().init();

mount(App, {
  target: getRootContainer(),
});

Widget.self.window.onDragDropEvent(async (e) => {
  const island = document.querySelector<HTMLElement>(".qq-island");
  const inIslandDropArea = () => {
    if (!island || island.dataset.filesEnabled !== "true") return false;
    // Tauri reports physical coordinates relative to the webview; DOM bounds use CSS pixels.
    const x = e.payload.type === "leave" ? -1 : e.payload.position.x / devicePixelRatio;
    const y = e.payload.type === "leave" ? -1 : e.payload.position.y / devicePixelRatio;
    const rect = island.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;

    // The island is display:none while hidden, so it has no DOM bounds. Keep a narrow
    // top-center reveal target so a file drag can open the shelf before the drop occurs.
    const width = Math.min(Number.parseFloat(island.style.getPropertyValue("--island-width")) || 360, window.innerWidth - 32);
    const top = Number.parseFloat(island.style.getPropertyValue("--island-top")) || 0;
    const left = (window.innerWidth - width) / 2;
    return x >= left && x <= left + width && y >= Math.max(0, top - 24) && y <= top + 96;
  };

  if (e.payload.type === "enter" || e.payload.type === "over") {
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: inIslandDropArea() }));
    return;
  }
  if (e.payload.type === "leave") {
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
    return;
  }
  if (e.payload.type === "drop") {
    if (inIslandDropArea()) {
      window.dispatchEvent(new CustomEvent("island-files", { detail: e.payload.paths }));
      window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
      return;
    }
    window.dispatchEvent(new CustomEvent("island-files-drag", { detail: false }));
    for (const path of e.payload.paths) {
      await invoke(SeelenCommand.WegPinItem, { path });
    }
  }
});
