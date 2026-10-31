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
  if (e.payload.type === "drop") {
    const island = document.querySelector(".qq-island");
    if (island) {
      const rect = island.getBoundingClientRect();
      // Wry already converts the native drop point to physical client coordinates.
      const x = e.payload.position.x / devicePixelRatio;
      const y = e.payload.position.y / devicePixelRatio;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        window.dispatchEvent(new CustomEvent("island-files", { detail: e.payload.paths }));
        return;
      }
    }
    for (const path of e.payload.paths) {
      await invoke(SeelenCommand.WegPinItem, { path });
    }
  }
});
