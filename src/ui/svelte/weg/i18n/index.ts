import { locale, t as baseT } from "libs/ui/svelte/utils/i18n";
import { derived } from "svelte/store";
import { desktopPreferences } from "../state/preferences.svelte.ts";

const t = derived(baseT, (translate) => (key: string, vars: Record<string, string> = {}) => {
  const custom = desktopPreferences.value.labels[key];
  if (typeof custom !== "string") return translate(key, vars);
  return Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, value), custom);
});

export { locale, t };
