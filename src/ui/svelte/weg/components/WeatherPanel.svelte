<script lang="ts">
  import { desktopPreferences } from "../state/preferences.svelte.ts";
  import { t } from "../i18n/index.ts";

  type LocationResult = { name: string; country?: string; admin1?: string; latitude: number; longitude: number };
  type WeatherNow = { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number };
  type WeatherSnapshot = { location: string; current: WeatherNow };

  let weather = $state<WeatherSnapshot | null>(null);
  let loading = $state(false);
  let error = $state("");

  function condition(code: number) {
    if (code === 0) return "晴朗";
    if (code <= 3) return "多云";
    if (code === 45 || code === 48) return "有雾";
    if (code <= 57) return "毛毛雨";
    if (code <= 67) return "有雨";
    if (code <= 77) return "有雪";
    if (code <= 82) return "阵雨";
    if (code <= 86) return "阵雪";
    if (code >= 95) return "雷雨";
    return "天气";
  }

  $effect(() => {
    const city = desktopPreferences.value.weatherLocation.trim();
    if (!city) {
      weather = null;
      loading = false;
      error = "";
      return;
    }

    let disposed = false;
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      loading = true;
      error = "";
      try {
        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.search = new URLSearchParams({ name: city, count: "1", language: "zh", format: "json" }).toString();
        const geoResponse = await fetch(geoUrl, { signal: controller.signal });
        if (!geoResponse.ok) throw new Error("geocoding failed");
        const locations = (await geoResponse.json()).results as LocationResult[] | undefined;
        const location = locations?.[0];
        if (!location) throw new Error("location not found");

        const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
        forecastUrl.search = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
          timezone: "auto",
        }).toString();
        const response = await fetch(forecastUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("forecast failed");
        const data = await response.json();
        if (!disposed) {
          weather = {
            location: [location.name, location.admin1 || location.country].filter(Boolean).join(" · "),
            current: data.current as WeatherNow,
          };
        }
      } catch (cause) {
        if (!disposed && !(cause instanceof DOMException && cause.name === "AbortError")) {
          error = $t("island.unavailable_weather");
        }
      } finally {
        if (!disposed) loading = false;
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 15 * 60_000);
    return () => { disposed = true; controller?.abort(); window.clearInterval(interval); };
  });
</script>

{#if !desktopPreferences.value.weatherLocation.trim()}
  <p>{$t("island.set_weather_location")}</p>
{:else if loading && !weather}
  <p>{$t("island.loading")}</p>
{:else if weather}
  <div class="weather-summary">
    <div><strong>{Math.round(weather.current.temperature_2m)}°</strong><span>{condition(weather.current.weather_code)}</span><small>{weather.location}</small></div>
    <div><span>{$t("island.temperature_feels")}</span><strong>{Math.round(weather.current.apparent_temperature)}°</strong></div>
    <div><span>{$t("island.humidity")}</span><strong>{Math.round(weather.current.relative_humidity_2m)}%</strong></div>
    <div><span>{$t("island.wind")}</span><strong>{Math.round(weather.current.wind_speed_10m)} km/h</strong></div>
  </div>
  <a class="weather-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">{$t("island.weather_attribution")}</a>
{:else if error}
  <p role="status">{error}</p>
{/if}
