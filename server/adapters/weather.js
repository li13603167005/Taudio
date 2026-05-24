import { getConfig } from "../config.js";
import { fetchJson } from "./http.js";

export async function getWeatherSummary() {
  const { openWeather, fallback } = getConfig();
  if (!openWeather.apiKey) {
    return {
      source: "local-default",
      summary: fallback.weather
    };
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    if (openWeather.lat && openWeather.lon) {
      url.searchParams.set("lat", openWeather.lat);
      url.searchParams.set("lon", openWeather.lon);
    } else {
      url.searchParams.set("q", openWeather.city);
    }
    url.searchParams.set("appid", openWeather.apiKey);
    url.searchParams.set("units", openWeather.units);
    url.searchParams.set("lang", openWeather.lang);

    const data = await fetchJson(url);
    const description = data.weather?.[0]?.description ?? "天气信息可用";
    const temp = Math.round(Number(data.main?.temp ?? 0));
    const feelsLike = Math.round(Number(data.main?.feels_like ?? temp));
    return {
      source: "openweather",
      summary: `${data.name || openWeather.city}：${description}，${temp}°C，体感 ${feelsLike}°C`,
      raw: {
        city: data.name,
        description,
        temp,
        feelsLike,
        humidity: data.main?.humidity
      }
    };
  } catch (error) {
    if (getConfig().realtime.strict) {
      return {
        source: "openweather-error",
        summary: `OpenWeather 获取失败：${error.message}`,
        error: error.message
      };
    }
    return {
      source: "openweather-fallback",
      summary: fallback.weather,
      error: error.message
    };
  }
}
