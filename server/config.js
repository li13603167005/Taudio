import fs from "node:fs";
import path from "node:path";

let loaded = false;

function envValue(...keys) {
  for (const key of keys) {
    if (process.env[key] !== undefined) return process.env[key];
  }
  return "";
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replaceAll("\\n", "\n");
  }
  return trimmed;
}

export function loadEnv(rootDir) {
  if (loaded) return;
  loaded = true;
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = unquote(trimmed.slice(index + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getConfig() {
  return {
    server: {
      host: process.env.HOST || "127.0.0.1",
      port: Number(process.env.PORT || 8080)
    },
    realtime: {
      strict: process.env.REALTIME_STRICT !== "0"
    },
    brain: {
      provider:
        process.env.BRAIN_PROVIDER ||
        (envValue("TAUDIO_USE_CLAUDE", "CLAUDIO_USE_CLAUDE") === "1" ? "claude-cli" : "local")
    },
    claude: {
      enabled: envValue("TAUDIO_USE_CLAUDE", "CLAUDIO_USE_CLAUDE") === "1",
      command: process.env.CLAUDE_COMMAND || "claude",
      timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS || 25000)
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      temperature: Number(process.env.DEEPSEEK_TEMPERATURE || 0.7),
      maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 500),
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS || 20000)
    },
    netease: {
      baseUrl: process.env.NETEASE_API_BASE || "",
      provider: process.env.MUSIC_PROVIDER || (process.env.NETEASE_API_BASE ? "netease-enhanced" : "local-synth"),
      cookie: process.env.NETEASE_COOKIE || "",
      level: process.env.NETEASE_LEVEL || "exhigh"
    },
    tts: {
      provider: process.env.TTS_PROVIDER || "browser"
    },
    openWeather: {
      apiKey: process.env.OPENWEATHER_API_KEY || "",
      city: process.env.OPENWEATHER_CITY || "Shanghai",
      lat: process.env.OPENWEATHER_LAT || "",
      lon: process.env.OPENWEATHER_LON || "",
      units: process.env.OPENWEATHER_UNITS || "metric",
      lang: process.env.OPENWEATHER_LANG || "zh_cn"
    },
    feishu: {
      appId: process.env.FEISHU_APP_ID || "",
      appSecret: process.env.FEISHU_APP_SECRET || "",
      calendarId: process.env.FEISHU_CALENDAR_ID || "primary"
    },
    fallback: {
      weather: envValue("TAUDIO_WEATHER", "CLAUDIO_WEATHER") || "室内收听，天气未知，默认清爽电台氛围",
      nextEvent: envValue("TAUDIO_NEXT_EVENT", "CLAUDIO_NEXT_EVENT") || "暂无即将开始的日程"
    },
    network: {
      proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || ""
    }
  };
}

export function getProviderStatus() {
  const config = getConfig();
  return {
    realtime: {
      strict: config.realtime.strict
    },
    brain: {
      provider: config.brain.provider,
      configured:
        config.brain.provider === "deepseek"
          ? Boolean(config.deepseek.apiKey)
          : config.brain.provider === "claude-cli"
            ? config.claude.enabled
            : true,
      model:
        config.brain.provider === "deepseek"
          ? config.deepseek.model
          : config.brain.provider === "claude-cli"
            ? config.claude.command
            : "rules"
    },
    music: {
      provider: config.netease.baseUrl ? config.netease.provider : "local-synth",
      configured: Boolean(config.netease.baseUrl),
      authenticated: Boolean(config.netease.cookie),
      level: config.netease.level
    },
    tts: {
      provider: config.tts.provider === "none" ? "none" : "browser-speech",
      configured: config.tts.provider !== "none"
    },
    weather: {
      provider: config.openWeather.apiKey ? "openweather" : "local-default",
      configured: Boolean(config.openWeather.apiKey)
    },
    calendar: {
      provider: config.feishu.appId && config.feishu.appSecret ? "feishu" : "local-default",
      configured: Boolean(config.feishu.appId && config.feishu.appSecret)
    }
  };
}
