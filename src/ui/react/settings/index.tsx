import { getRootContainer } from "libs/ui/react/utils/index.ts";
import { createRoot } from "react-dom/client";
import { Widget } from "@seelen-ui/lib";
import { LogicalSize } from "@seelen-ui/lib/tauri";

import { LiteSettings } from "./LiteSettings.tsx";

import "@seelen-ui/lib/styles/reset.css";
import "./styles/lite.css";

const { window } = Widget.self;

await Promise.all([
  window.setDecorations(true),
  window.setSizeConstraints({ minWidth: 540, minHeight: 420 }),
  window.setSize(new LogicalSize(680, 620)),
]);
await window.center();

await Widget.self.init();
await Widget.self.show();

Widget.self.onTrigger((payload) => {
  window.unminimize();
  window.setFocus();
  const route = payload.customArgs?.["route"] as string | undefined;
  if (route) {
    globalThis.location.hash = route;
  }
});

const container = getRootContainer();
createRoot(container).render(<LiteSettings />);
