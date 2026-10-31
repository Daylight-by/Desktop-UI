import { subscribe, SeelenEvent } from "@seelen-ui/lib";
import { lazyRune } from "libs/ui/svelte/utils";
import { defaultPreferences, label, normalizePreferences, readPreferences, type LitePreferences } from "libs/desktop-lite/preferences";

const preferences = lazyRune(() => readPreferences().catch(() => defaultPreferences));
subscribe(SeelenEvent.LitePreferencesChanged, (event) => {
  preferences.value = normalizePreferences(event.payload as Partial<LitePreferences>);
});
await preferences.init();

class DesktopPreferences {
  get value() { return preferences.value; }
  text(key: string) { return label(preferences.value, key); }
}
export const desktopPreferences = new DesktopPreferences();
