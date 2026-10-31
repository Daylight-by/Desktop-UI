import defaults from "../../src/static/lite-defaults.json" with { type: "json" };
import { invoke } from "@tauri-apps/api/core";

export type LitePreferences = Omit<typeof defaults, "labels"> & { labels: Record<string, string>; configPath?: string };

export function normalizePreferences(raw: Partial<LitePreferences>): LitePreferences {
  const result = { ...defaults, ...raw, labels: { ...defaults.labels, ...raw.labels } } as LitePreferences;
  const ranges = { islandWidth: [280, 520], islandOpacity: [0, 100], lyricFontSize: [12, 22], topOffset: [0, 80], autoHideDelay: [300, 10000], dockSize: [24, 64], dockHideDelay: [100, 5000], dockShowDelay: [0, 2000] };
  for (const [key, range] of Object.entries(ranges)) {
    const name = key as keyof typeof ranges;
    const value = Number(result[name]);
    result[name] = Number.isFinite(value) ? Math.min(range[1]!, Math.max(range[0]!, value)) : defaults[name];
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "boolean" && typeof result[key as keyof LitePreferences] !== "boolean") Object.assign(result, { [key]: value });
  }
  if (!["transparent", "light", "dark", "system"].includes(result.islandTheme)) result.islandTheme = defaults.islandTheme;
  if (typeof result.name !== "string" || !result.name.trim()) result.name = defaults.name;
  result.name = result.name.trim().slice(0, 60);
  return result;
}

export const defaultPreferences = normalizePreferences({});
export async function readPreferences(): Promise<LitePreferences> {
  return normalizePreferences(await invoke("get_lite_preferences"));
}
export async function writePreferences(value: LitePreferences) {
  await invoke("set_lite_preferences", { preferences: normalizePreferences(value) });
}
export function label(value: LitePreferences, key: string): string {
  const text = value.labels[key];
  return typeof text === "string" ? text : key;
}
