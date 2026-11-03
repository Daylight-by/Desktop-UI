import { SeelenEvent } from "@seelen-ui/lib";
import { window as TauriWindow } from "@seelen-ui/lib/tauri";

class LayeredHitbox {
  private _isIgnoringCursorEvents: boolean = true;
  public firstClick: boolean = true;

  get isIgnoringCursorEvents(): boolean {
    return this._isIgnoringCursorEvents;
  }

  set isIgnoringCursorEvents(value: boolean) {
    if (value == false) {
      this.firstClick = true;
    }
    this._isIgnoringCursorEvents = value;
  }
}

export interface LayeredHitboxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayeredHitboxOptions {
  retainDuringDrag?: boolean;
  getPhysicalRect: () => LayeredHitboxRect;
  shouldAllowMouseEvent?: (
    element: Element,
    screenPosition?: { x: number; y: number },
    isDragging?: boolean,
  ) => boolean;
}

export async function declareDocumentAsLayeredHitbox(
  options: LayeredHitboxOptions,
): Promise<() => void> {
  const { getPhysicalRect, shouldAllowMouseEvent = (element) => element != document.body } = options;
  const window = TauriWindow.getCurrentWindow();

  await window.setIgnoreCursorEvents(true);
  const data = new LayeredHitbox();
  let dragHoldUntil = 0;

  const unlistenMouseMove = await window.listen<[x: number, y: number, dragging: number]>(SeelenEvent.GlobalMouseMove, (event) => {
    const [mouseX, mouseY, dragging] = event.payload;
    if (options.retainDuringDrag && performance.now() < dragHoldUntil) {
      if (dragging === 1) dragHoldUntil = performance.now() + 300;
      return;
    }
    const { x: windowX, y: windowY, width: windowWidth, height: windowHeight } = getPhysicalRect();

    const isHoverWindow = mouseX >= windowX &&
      mouseX <= windowX + windowWidth &&
      mouseY >= windowY &&
      mouseY <= windowY + windowHeight;

    if (!isHoverWindow) {
      const shouldAllow = shouldAllowMouseEvent(document.body, { x: mouseX, y: mouseY }, dragging === 1);
      if (shouldAllow == data.isIgnoringCursorEvents) {
        data.isIgnoringCursorEvents = !shouldAllow;
        window.setIgnoreCursorEvents(!shouldAllow);
      }
      return;
    }

    const adjustedX = (mouseX - windowX) / globalThis.devicePixelRatio;
    const adjustedY = (mouseY - windowY) / globalThis.devicePixelRatio;

    const elementAtPoint = document.elementFromPoint(adjustedX, adjustedY);
    if (!elementAtPoint) {
      return;
    }

    const shouldAllow = shouldAllowMouseEvent(elementAtPoint, { x: mouseX, y: mouseY }, dragging === 1);
    if (options.retainDuringDrag && dragging === 1 && shouldAllow) dragHoldUntil = performance.now() + 300;
    if (shouldAllow == data.isIgnoringCursorEvents) {
      data.isIgnoringCursorEvents = !shouldAllow;
      window.setIgnoreCursorEvents(!shouldAllow);
    }
  });

  const onTouchStart = (e: TouchEvent) => {
    const shouldAllow = shouldAllowMouseEvent(e.target as Element);
    if (shouldAllow == data.isIgnoringCursorEvents) {
      data.isIgnoringCursorEvents = !shouldAllow;
      window.setIgnoreCursorEvents(!shouldAllow);
    }
  };
  globalThis.addEventListener("touchstart", onTouchStart);

  return () => {
    unlistenMouseMove();
    globalThis.removeEventListener("touchstart", onTouchStart);
    window.setIgnoreCursorEvents(false);
  };
}
