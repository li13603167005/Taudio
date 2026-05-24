import { getConfig } from "../config.js";
import { fetchJson, joinUrl } from "./http.js";

const cookieAttributeNames = new Set(["domain", "path", "expires", "max-age", "samesite", "secure", "httponly"]);
let listeningHistoryCache = { expiresAt: 0, tracks: [] };

function normalizeCookie(rawCookie) {
  const pairs = new Map();
  for (const part of rawCookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    const key = index === -1 ? trimmed : trimmed.slice(0, index).trim();
    if (!key || cookieAttributeNames.has(key.toLowerCase())) continue;
    const value = index === -1 ? "" : trimmed.slice(index + 1).trim();
    pairs.set(key, value);
  }
  if (!pairs.has("os")) pairs.set("os", "pc");
  return Array.from(pairs, ([key, value]) => (value ? `${key}=${value}` : key)).join("; ");
}

function neteaseHeaders() {
  const { netease } = getConfig();
  if (!netease.cookie) return {};
  return { cookie: normalizeCookie(netease.cookie) };
}

function isTrialUrl(item) {
  if (!item?.url) return false;
  if (item.freeTrialInfo) return true;
  return item.freeTrialPrivilege?.listenType === 0 && Number(item.time || 0) > 0 && Number(item.time || 0) <= 65000;
}

function playableUrlFromPayload(payload) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  if (!item?.url) return "";
  return isTrialUrl(item) ? "" : item.url;
}

function normalizeSong(song) {
  const artist = song.artists?.[0]?.name || song.ar?.[0]?.name || "Unknown Artist";
  return {
    id: String(song.id),
    title: song.name || "Untitled",
    artist,
    album: song.album?.name || song.al?.name || "",
    mood: "online",
    bpm: null
  };
}

function normalizeRecommendation(item) {
  const song = item.song || item;
  return normalizeSong(song);
}

export async function searchNeteaseSongs(query, limit = 5) {
  const { netease } = getConfig();
  if (!netease.baseUrl) return [];
  const url = new URL(joinUrl(netease.baseUrl, "/cloudsearch"));
  url.searchParams.set("keywords", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("type", "1");
  url.searchParams.set("timestamp", String(Date.now()));
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  return (data.result?.songs ?? []).map(normalizeSong);
}

export async function getNeteaseDailySongs(limit = 40) {
  const { netease } = getConfig();
  if (!netease.baseUrl) return [];
  const url = new URL(joinUrl(netease.baseUrl, "/recommend/songs"));
  url.searchParams.set("timestamp", String(Date.now()));
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  return (data.data?.dailySongs ?? []).slice(0, limit).map(normalizeRecommendation);
}

export async function getNeteaseNewSongs(limit = 30) {
  const { netease } = getConfig();
  if (!netease.baseUrl) return [];
  const url = new URL(joinUrl(netease.baseUrl, "/personalized/newsong"));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("timestamp", String(Date.now()));
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  return (data.result ?? []).slice(0, limit).map(normalizeRecommendation);
}

export async function getNeteaseListeningHistory(limit = 100) {
  const { netease } = getConfig();
  if (!netease.baseUrl || !netease.cookie) return [];
  if (listeningHistoryCache.expiresAt > Date.now()) return listeningHistoryCache.tracks.slice(0, limit);

  const login = await getNeteaseLoginStatus();
  if (!login.authenticated || !login.userId) return [];
  const url = new URL(joinUrl(netease.baseUrl, "/user/record"));
  url.searchParams.set("uid", String(login.userId));
  url.searchParams.set("type", "0");
  url.searchParams.set("timestamp", String(Date.now()));
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  const rows = data.allData || data.weekData || [];
  const tracks = rows.map((item) => normalizeRecommendation(item.song || item)).filter((track) => track.id);
  listeningHistoryCache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    tracks
  };
  return tracks.slice(0, limit);
}

export async function getNeteaseSongUrl(id) {
  const { netease } = getConfig();
  if (!netease.baseUrl) return "";
  const playerUrl = new URL(joinUrl(netease.baseUrl, "/song/url/v1"));
  playerUrl.searchParams.set("id", id);
  playerUrl.searchParams.set("level", netease.level);
  playerUrl.searchParams.set("timestamp", String(Date.now()));
  const playerData = await fetchJson(playerUrl, { headers: neteaseHeaders() });
  const playablePlayerUrl = playableUrlFromPayload(playerData);
  if (playablePlayerUrl) return playablePlayerUrl;

  const downloadUrl = new URL(joinUrl(netease.baseUrl, "/song/download/url/v1"));
  downloadUrl.searchParams.set("id", id);
  downloadUrl.searchParams.set("level", netease.level);
  downloadUrl.searchParams.set("timestamp", String(Date.now()));
  const downloadData = await fetchJson(downloadUrl, { headers: neteaseHeaders() }).catch(() => null);
  return playableUrlFromPayload(downloadData);
}

export async function getNeteaseLyric(id) {
  const { netease } = getConfig();
  if (!netease.baseUrl) return "";
  const url = new URL(joinUrl(netease.baseUrl, "/lyric"));
  url.searchParams.set("id", id);
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  return data.lrc?.lyric || "";
}

function normalizeComment(comment) {
  const content = String(comment?.content || "").replace(/\s+/g, " ").trim();
  if (!content || content.length < 14) return null;
  if (/https?:\/\//i.test(content)) return null;
  if (/(有没有|来[的了]|打卡|签到|报到|第一|前排|999|火钳|占座|求赞)/.test(content)) return null;
  if (/(小三|出轨|嫂子|哥哥|按在地上|死水般|约炮|开房|黄片|自杀|死了|去死|大麻|吸毒)/.test(content)) return null;
  if (/(垃圾|难听|不配|唯一好听|烂|拉胯|差评|退钱)/.test(content)) return null;
  return {
    content: content.length > 90 ? `${content.slice(0, 88)}...` : content,
    likedCount: Number(comment.likedCount || 0),
    user: comment.user?.nickname || ""
  };
}

export async function getNeteaseHotComment(id) {
  const { netease } = getConfig();
  if (!netease.baseUrl || !id) return null;
  const url = new URL(joinUrl(netease.baseUrl, "/comment/music"));
  url.searchParams.set("id", id);
  url.searchParams.set("limit", "8");
  url.searchParams.set("timestamp", String(Date.now()));
  const data = await fetchJson(url, { headers: neteaseHeaders() });
  const candidates = [...(data.hotComments || []), ...(data.comments || [])]
    .map(normalizeComment)
    .filter(Boolean)
    .sort((a, b) => b.likedCount - a.likedCount);
  return candidates[0] || null;
}

export async function getNeteaseLoginStatus() {
  const { netease } = getConfig();
  if (!netease.baseUrl || !netease.cookie) {
    return {
      authenticated: false,
      status: "not-configured"
    };
  }
  try {
    const data = await fetchJson(joinUrl(netease.baseUrl, "/login/status"), {
      headers: neteaseHeaders()
    });
    const profile = data.data?.profile || data.data?.account || null;
    return {
      authenticated: Boolean(profile),
      status: profile ? "online" : "invalid-cookie",
      nickname: profile?.nickname || "",
      userId: profile?.userId || profile?.id || ""
    };
  } catch (error) {
    return {
      authenticated: false,
      status: "error",
      error: error.message
    };
  }
}

export async function getNeteaseVipInfo(userId) {
  const { netease } = getConfig();
  if (!netease.baseUrl || !netease.cookie) {
    return {
      status: "not-configured"
    };
  }
  try {
    const url = new URL(joinUrl(netease.baseUrl, "/vip/info/v2"));
    if (userId) url.searchParams.set("uid", userId);
    const data = await fetchJson(url, { headers: neteaseHeaders() });
    const payload = data.data || data;
    return {
      status: "online",
      vipType: payload.vipType ?? payload.associator?.vipCode ?? null,
      redVipLevel: payload.redVipLevel ?? payload.redVipAnnualCount ?? null,
      rawCode: data.code
    };
  } catch (error) {
    return {
      status: "error",
      error: error.message
    };
  }
}

export async function checkNeteaseHealth(query = "Frank Ocean Pink White") {
  const { netease } = getConfig();
  if (!netease.baseUrl) {
    return {
      provider: "local-synth",
      status: "disabled"
    };
  }
  try {
    const songs = await searchNeteaseSongs(query, 5);
    const login = await getNeteaseLoginStatus();
    const vip = await getNeteaseVipInfo(login.userId);
    for (const song of songs) {
      const url = await getNeteaseSongUrl(song.id);
      if (url) {
        return {
          provider: netease.provider,
          status: "online",
          sample: {
            id: song.id,
            title: song.title,
            artist: song.artist,
            hasUrl: true
          },
          account: login,
          vip
        };
      }
    }
    return {
      provider: netease.provider,
      status: "degraded",
      error: "Search worked, but no playable URL was returned.",
      account: login,
      vip
    };
  } catch (error) {
    return {
      provider: netease.provider,
      status: "offline",
      error: error.message
    };
  }
}
