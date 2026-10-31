import { normalizePreferences } from "./preferences.ts";
import { test } from "node:test";

test("desktop geometry and timers remain within usable bounds", () => {
  const result = normalizePreferences({ islandWidth: 9999, lyricFontSize: -1, dockSize: NaN, autoHideDelay: 0 });
  if (result.islandWidth !== 520 || result.lyricFontSize !== 12 || result.dockSize !== 40 || result.autoHideDelay !== 300) throw Error("Unsafe preferences were accepted");
});
test("new defaults preserve personal labels and reject an unknown theme", () => {
  const result = normalizePreferences({ labels: { "island.tools": "个人名称" }, islandTheme: "missing" });
  if (result.labels["island.tools"] !== "个人名称" || !result.labels["island.network"] || result.islandTheme !== "transparent") throw Error("Preference migration failed");
});
