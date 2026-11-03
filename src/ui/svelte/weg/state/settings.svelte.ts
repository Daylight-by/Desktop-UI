import { invoke, RuntimeStyleSheet, SeelenCommand, Widget } from "@seelen-ui/lib";
import { Alignment, FancyToolbarSide, HideMode, SeelenWegSide } from "@seelen-ui/lib/types";
import { isTouchPrimary } from "libs/ui/svelte/utils";
import { locale } from "../i18n/index.ts";
import { declareDocumentAsLayeredHitbox } from "libs/ui/react/utils/layered.ts";
import { systemState } from "./system.svelte.ts";
import { settings as _settings } from "./getters.svelte.ts";
import { dateState } from "libs/ui/svelte/runes/date.svelte.ts";
import { rootEffectAsync } from "libs/ui/svelte/utils/RootEffect.svelte.ts";
import { islandState } from "./island.svelte.ts";
import { desktopPreferences } from "./preferences.svelte.ts";
import { mousePos, mouseState } from "./getters.svelte.ts";

let isWidgetReady = $state(false);
const settings = $derived(_settings.value.byWidget["@seelen/weg"]);

const workArea = $derived.by(() => {
  const workArea = systemState.currentMonitor.rect;
  const tbConfig = _settings.value.byWidget["@seelen/fancy-toolbar"];
  const tbMonitorConfig = (_settings.value.monitorsV3[systemState.currentMonitor.id] as any)
    ?.byWidget?.["@seelen/fancy-toolbar"] || { enabled: true };

  if (!tbConfig?.enabled || !tbMonitorConfig?.enabled) {
    return workArea;
  }

  const tbSize = Math.round(
    (tbConfig.itemSize + tbConfig.padding * 2 + tbConfig.margin * 2) *
      systemState.currentMonitor.scaleFactor,
  );

  switch (tbConfig.position) {
    case FancyToolbarSide.Top:
      return { ...workArea, top: workArea.top + tbSize };
    case FancyToolbarSide.Bottom:
      return { ...workArea, bottom: workArea.bottom - tbSize };
  }

  return workArea;
});

function isIslandDropActivationPoint(point: { x: number; y: number }): boolean {
  const scale = systemState.currentMonitor.scaleFactor || 1;
  const wa = workArea;
  const preferences = desktopPreferences.value;
  const areaWidthCss = (wa.right - wa.left) / scale;
  const islandWidthCss = Math.min(preferences.islandWidth, Math.max(0, areaWidthCss - 32));
  const left = wa.left + ((areaWidthCss - islandWidthCss) / 2) * scale;
  const right = left + islandWidthCss * scale;
  const top = wa.top + preferences.topOffset * scale;
  const margin = 40 * scale;

  return point.x >= left - margin && point.x <= right + margin &&
    point.y >= Math.max(wa.top, top - 32 * scale) && point.y <= top + 144 * scale;
}

// Keep the webview available for the whole duration of a file drag. The layered
// hitbox still allows pointer events only over the island/Dock, but keeping the
// window mounted prevents the native drag stream from being cancelled when the
// cursor moves from the island header into the lower file shelf.
const fileDropDragActive = $derived.by(() =>
  desktopPreferences.value.filesEnabled && mouseState.isDragging
);

const widgetRect = $derived.by(() => {
  const wa = workArea;
  const hitboxRect = { ...workArea };
  const webviewRect = { ...workArea };

  const size = Math.round(
    (settings.size + settings.padding * 2 + settings.margin * 2) *
      systemState.currentMonitor.scaleFactor,
  );

  switch (settings.position) {
    case SeelenWegSide.Left:
      hitboxRect.right = hitboxRect.left + size;
      webviewRect.right = isTouchPrimary.value ? hitboxRect.right : wa.right - Math.round((wa.right - wa.left) / 4);
      break;
    case SeelenWegSide.Right:
      hitboxRect.left = hitboxRect.right - size;
      webviewRect.left = isTouchPrimary.value ? hitboxRect.left : wa.left + Math.round((wa.right - wa.left) / 4);
      break;
    case SeelenWegSide.Top:
      hitboxRect.bottom = hitboxRect.top + size;
      webviewRect.bottom = isTouchPrimary.value ? hitboxRect.bottom : wa.top + Math.round((wa.bottom - wa.top) / 4);
      break;
    case SeelenWegSide.Bottom:
      hitboxRect.top = hitboxRect.bottom - size;
      webviewRect.top = isTouchPrimary.value ? hitboxRect.top : wa.bottom - Math.round((wa.bottom - wa.top) / 4);
      break;
  }

  return { hitboxRect, webviewRect: islandState.visible || fileDropDragActive || (desktopPreferences.value.islandEnabled && desktopPreferences.value.filesEnabled) ? { ...wa } : webviewRect };
});

$effect.root(() => {
  $effect(() => {
    locale.set(_settings.value.language);
    dateState.setLang(_settings.value.language);
    dateState.setFormat(_settings.value.dateFormat);
  });
});

export const fullSettings = {
  get value() {
    return _settings.value;
  },
};

class SettingsState {
  popupAlignX = $derived.by(() => {
    switch (settings.position) {
      case SeelenWegSide.Left:
        return Alignment.Start;
      case SeelenWegSide.Right:
        return Alignment.End;
      default:
        return Alignment.Center;
    }
  });

  popupAlignY = $derived.by(() => {
    switch (settings.position) {
      case SeelenWegSide.Bottom:
        return Alignment.End;
      case SeelenWegSide.Top:
        return Alignment.Start;
      default:
        return Alignment.Center;
    }
  });

  tooltipOrigin = $derived.by(() => {
    const origin: { x: number | null; y: number | null } = { x: null, y: null };
    const rect = settingsState.widgetRect.hitboxRect;
    switch (settingsState.position) {
      case SeelenWegSide.Left:
        origin.x = rect.right;
        break;
      case SeelenWegSide.Right:
        origin.x = rect.left;
        break;
      case SeelenWegSide.Top:
        origin.y = rect.bottom;
        break;
      case SeelenWegSide.Bottom:
        origin.y = rect.top;
        break;
    }
    return origin;
  });

  get isReady() {
    return isWidgetReady;
  }

  set isReady(v: boolean) {
    isWidgetReady = v;
  }

  get all() {
    return _settings.value;
  }

  get allByWidget() {
    return _settings.value.byWidget;
  }

  get value() {
    return settings;
  }

  get position(): SeelenWegSide {
    return settings.position;
  }

  get hideMode(): HideMode {
    return settings.hideMode;
  }

  get delayToHide(): number {
    return settings.delayToHide;
  }

  get delayToShow(): number {
    return settings.delayToShow;
  }

  get widgetRect() {
    return widgetRect;
  }
}

export const settingsState = new SettingsState();

export function isHorizontalDock(): boolean {
  const pos = settings.position;
  return pos === SeelenWegSide.Top || pos === SeelenWegSide.Bottom;
}

async function updateWidgetPosition() {
  const { hitboxRect, webviewRect } = widgetRect;
  const isTouch = isTouchPrimary.value;
  const hideMode = settings.hideMode;
  const position = settings.position;
  const isReady = settingsState.isReady;

  await Widget.self.setPosition(webviewRect);

  if (!isReady) {
    return;
  }

  if (hideMode === HideMode.Never || isTouch) {
    await invoke(SeelenCommand.RegisterAppBar, {
      rect: hitboxRect,
      edge: position as any,
    });
  } else {
    await invoke(SeelenCommand.UnregisterAppBar);
  }
}

Widget.self.attachPosition();
Widget.self.preReadyTasks.push(rootEffectAsync(updateWidgetPosition));

$effect.root(() => {
  $effect(() => {
    const { size, padding, margin, spaceBetweenItems } = settings;
    const sheet = new RuntimeStyleSheet("@config/weg");
    sheet.addVariable("--config-margin", `${margin}px`);
    sheet.addVariable("--config-padding", `${padding}px`);
    sheet.addVariable("--config-item-size", `${size}px`);
    sheet.addVariable("--config-space-between-items", `${spaceBetweenItems}px`);
    sheet.applyToDocument();
  });

  $effect(() => {
    if (isTouchPrimary.value) return;

    let unlisten: (() => void) | null = null;
    declareDocumentAsLayeredHitbox({
      retainDuringDrag: true,
      getPhysicalRect: () => {
        const r = widgetRect.webviewRect;
        return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
      },
      shouldAllowMouseEvent: (element, point, dragging) =>
        !!element.closest(".taskbar, .qq-island") ||
        !!element.closest(".qq-island-drop-sensor") ||
        (!!point && dragging === true && desktopPreferences.value.filesEnabled && isIslandDropActivationPoint(point)),
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });

    return () => {
      unlisten?.();
    };
  });
});

$effect.root(() => {
  $effect(() => {
    if (desktopPreferences.value.filesEnabled && mouseState.isDragging && isIslandDropActivationPoint(mousePos.value)) {
      window.dispatchEvent(new CustomEvent("island-files-drag", { detail: true }));
    }
  });
});
