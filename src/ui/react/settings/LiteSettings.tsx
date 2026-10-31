import { useEffect, useState } from "react";
import { Settings, Widget, invoke, SeelenCommand } from "@seelen-ui/lib";
import { HideMode, WegAttentionReveal } from "@seelen-ui/lib/types";
import { defaultPreferences, label, normalizePreferences, readPreferences, writePreferences, type LitePreferences } from "libs/desktop-lite/preferences";

export function LiteSettings() {
  const [value, setValue] = useState<LitePreferences>(defaultPreferences);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const text = (key: string) => label(value, key);
  async function load() {
    try { const next = await readPreferences(); setValue(next); setStatus(""); await Widget.self.window.setTitle(next.name); }
    catch { setStatus(text("island.unavailable")); }
  }
  useEffect(() => {
    void load();
    document.getElementById("splashscreen")?.remove();
    void Widget.self.ready();
  }, []);
  function patch(key: keyof LitePreferences, next: unknown) { setValue((previous) => ({ ...previous, [key]: next })); setStatus(""); }
  async function save() {
    setBusy(true); setStatus("");
    try {
      const next = normalizePreferences(value);
      setValue(next);
      await writePreferences(next);
      const settings = await Settings.getAsync();
      const dock = settings.inner.byWidget["@seelen/weg"]!;
      dock.hideMode = next.dockAutoHide ? HideMode.Always : HideMode.Never;
      dock.size = next.dockSize;
      dock.delayToHide = next.dockHideDelay;
      dock.delayToShow = next.dockShowDelay;
      dock.revealOnAttention = WegAttentionReveal.Never;
      await settings.save();
      await Widget.self.window.setTitle(value.name);
      setStatus(text("settings.saved"));
    } catch (error) { console.error(error); setStatus(text("settings.failed")); }
    finally { setBusy(false); }
  }
  function toggle(key: keyof LitePreferences, title: string) {
    return <label className="lite-setting-row"><span>{text(title)}</span><input type="checkbox" data-skin="switch" checked={Boolean(value[key])} onChange={(e) => patch(key, e.currentTarget.checked)} /></label>;
  }
  function number(key: "islandWidth" | "lyricFontSize" | "topOffset" | "autoHideDelay" | "dockSize" | "dockHideDelay", title: string, min: number, max: number) {
    return <label className="lite-setting-row"><span>{text(title)}</span><input data-skin="default" type="number" min={min} max={max} value={value[key]} onChange={(e) => patch(key, Number(e.currentTarget.value))} /></label>;
  }
  return <main className="lite-settings">
    <header><div><h1>{value.name}</h1><p>{text("settings.description")}</p></div></header>
    <section><h2>{text("settings.island")}</h2>
      {toggle("islandEnabled", "settings.enabled")}
      {toggle("islandAutoHide", "settings.auto_hide")}
      {toggle("showWhilePlaying", "settings.playing_visible")}
      {toggle("clockVisible", "settings.clock")}
      {toggle("dateVisible", "settings.date")}
      {toggle("showArtist", "settings.artist")}
      {toggle("showNotifications", "settings.notifications")}
      {toggle("volumeAlerts", "settings.alerts")}
      <p>{text("settings.swipe_hint")}</p>
    </section>
    <section><h2>{text("settings.appearance")}</h2>
      <label className="lite-setting-row"><span>{text("settings.name")}</span><input data-skin="default" maxLength={60} value={value.name} onChange={(e) => patch("name", e.currentTarget.value)} /></label>
      <label className="lite-setting-row"><span>{text("settings.theme")}</span><select data-skin="default" value={value.islandTheme} onChange={(e) => patch("islandTheme", e.currentTarget.value)}>{["transparent", "light", "dark", "system"].map((theme) => <option key={theme} value={theme}>{text(`settings.${theme}`)}</option>)}</select></label>
      <label className="lite-setting-row"><span>{text("settings.opacity")}<small>{text("settings.opacity_hint")}</small></span><span className="lite-opacity-control"><input data-skin="flat" type="range" min={0} max={100} step={5} value={value.islandOpacity} onChange={(e) => patch("islandOpacity", Number(e.currentTarget.value))} /><output>{value.islandOpacity}%</output></span></label>
      {number("islandWidth", "settings.width", 280, 520)}
      {number("lyricFontSize", "settings.font", 12, 22)}
      {number("topOffset", "settings.offset", 0, 80)}
      {number("autoHideDelay", "settings.hide_delay", 300, 10000)}
    </section>
    <section><h2>{text("settings.dock")}</h2>{toggle("dockAutoHide", "settings.dock_hide")}{number("dockSize", "settings.dock_size", 24, 64)}{number("dockHideDelay", "settings.hide_delay", 100, 5000)}</section>
    <section><h2>{text("settings.modules")}</h2>
      {toggle("networkEnabled", "settings.network")}{toggle("bluetoothEnabled", "settings.bluetooth")}{toggle("trayEnabled", "settings.tray")}{toggle("clipboardEnabled", "island.clipboard")}{toggle("filesEnabled", "island.files")}
      {toggle("countdownEnabled", "settings.countdown")}{toggle("pomodoroEnabled", "settings.pomodoro")}
      {toggle("weatherEnabled", "settings.weather")}
      <label className="lite-setting-row"><span>{text("settings.weather_location")}<small>{text("settings.weather_location_hint")}</small></span><input data-skin="default" maxLength={80} value={value.weatherLocation} onChange={(e) => patch("weatherLocation", e.currentTarget.value)} /></label>
      {toggle("hardwareEnabled", "settings.hardware")}{toggle("waveformEnabled", "settings.waveform")}
    </section>
    <section><h2>{text("settings.open_config")}</h2><p>{text("settings.custom_hint")}</p><p className="lite-config-path">{value.configPath}</p>
      <div className="lite-setting-actions"><button data-skin="default" onClick={() => value.configPath && invoke(SeelenCommand.OpenFile, { path: value.configPath })}>{text("settings.open_config")}</button><button data-skin="transparent" onClick={() => value.configPath && invoke(SeelenCommand.OpenFile, { path: value.configPath.replace(/[/\\]app[/\\][^/\\]+$/, "") })}>{text("settings.open_source")}</button></div>
    </section>
    <footer><span role="status">{status}</span><button data-skin="transparent" disabled={busy} onClick={() => void load()}>{text("settings.reload")}</button><button data-skin="solid" disabled={busy} onClick={() => void save()}>{text("settings.save")}</button></footer>
  </main>;
}
