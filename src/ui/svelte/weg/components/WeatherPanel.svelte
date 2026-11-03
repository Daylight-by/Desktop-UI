<script lang="ts">
  import { desktopPreferences } from "../state/preferences.svelte.ts";
  import { t } from "../i18n/index.ts";

  type LocationResult = {
    name: string;
    country?: string;
    country_code?: string;
    admin1?: string;
    admin2?: string;
    latitude: number;
    longitude: number;
    population?: number;
  };
  type WeatherNow = {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
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

  function normalizeCity(value: string) {
    return value.trim().replace(/\s+/g, "");
  }

  function scoreLocation(city: string, location: LocationResult) {
    const name = location.name.trim();
    const admin2 = location.admin2?.trim() || "";
    const population = Number(location.population) || 0;
    let score = Math.log10(population + 10);

    if (name === city || name === `${city}市`) score += 40;
    else if (name.startsWith(city)) score += 20;
    else if (admin2 === city || admin2 === `${city}市` || admin2.startsWith(city)) score += 15;

    if (name.endsWith("市") || admin2.endsWith("市")) score += 8;
    if (location.country_code === "CN" || location.country === "中国") score += 5;
    if (/村|乡|镇$/.test(name)) score -= 25;
    return score;
  }

  function pickLocation(city: string, locations: LocationResult[]) {
    if (!locations.length) return undefined;
    return [...locations].sort((a, b) => scoreLocation(city, b) - scoreLocation(city, a))[0];
  }

  async function searchLocations(city: string, signal: AbortSignal) {
    const queries = [city];
    if (!/[市县区州盟]$/.test(city)) queries.push(`${city}市`);

    const seen = new Set<string>();
    const locations: LocationResult[] = [];
    for (const query of queries) {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.search = new URLSearchParams({
        name: query,
        count: "10",
        language: "zh",
        format: "json",
      }).toString();
      const geoResponse = await fetch(geoUrl, { signal });
      if (!geoResponse.ok) throw new Error("geocoding failed");
      const results = ((await geoResponse.json()).results || []) as LocationResult[];
      for (const location of results) {
        const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        locations.push(location);
      }
    }
    return locations;
  }

  function formatLocation(location: LocationResult) {
    return [location.name, location.admin1 || location.country].filter(Boolean).join(" · ");
  }

  $effect(() => {
    const city = normalizeCity(desktopPreferences.value.weatherLocation);
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
        const location = pickLocation(city, await searchLocations(city, controller.signal));
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
            location: formatLocation(location),
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
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  });
</script>

{#if !normalizeCity(desktopPreferences.value.weatherLocation)}
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
