import defaults from "../../src/static/lite-defaults.json" with { type: "json" };
import { invoke } from "@tauri-apps/api/core";

export type LitePreferences = Omit<typeof defaults, "labels"> & { labels: Record<string, string>; configPath?: string };

export function normalizePreferences(raw: Partial<LitePreferences>): LitePreferences {
  const result = { ...defaults, ...raw, labels: { ...defaults.labels, ...raw.labels } } as LitePreferences;
  const ranges = { islandWidth: [280, 520], islandOpacity: [0, 100], appsMenuOpacity: [0, 100], lyricFontSize: [12, 22], topOffset: [0, 80], autoHideDelay: [300, 10000], dockSize: [24, 64], dockHideDelay: [100, 5000], dockShowDelay: [0, 2000] };
  for (const [key, range] of Object.entries(ranges)) {
    const name = key as keyof typeof ranges;
    const value = Number(result[name]);
    result[name] = Number.isFinite(value) ? Math.min(range[1]!, Math.max(range[0]!, value)) : defaults[name];
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "boolean" && typeof result[key as keyof LitePreferences] !== "boolean") Object.assign(result, { [key]: value });
  }
  if (!["transparent", "light", "dark", "system", "glass"].includes(result.islandTheme)) result.islandTheme = defaults.islandTheme;
  if (typeof result.islandSavedAppearance !== "string" || result.islandSavedAppearance.length > 4096) result.islandSavedAppearance = "";
  if (typeof result.name !== "string" || !result.name.trim()) result.name = defaults.name;
  result.name = result.name.trim().slice(0, 60);
  if (typeof result.weatherLocation !== "string") result.weatherLocation = defaults.weatherLocation;
  result.weatherLocation = result.weatherLocation.trim().slice(0, 80);
  return result;
}

export const defaultPreferences = normalizePreferences({});

const appearanceKeys = ["islandTheme", "islandOpacity", "islandWidth", "lyricFontSize", "topOffset", "islandHoverExpand"] as const;
export function rememberAppearance(value: LitePreferences): string {
  return JSON.stringify(Object.fromEntries(appearanceKeys.map((key) => [key, value[key]])));
}
export function restoreAppearance(value: LitePreferences): LitePreferences {
  try {
    const saved = JSON.parse(value.islandSavedAppearance);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return value;
    const appearance = Object.fromEntries(appearanceKeys.filter((key) => key in saved).map((key) => [key, saved[key]]));
    return normalizePreferences({ ...value, ...appearance });
  } catch { return value; }
}
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
