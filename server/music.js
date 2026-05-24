import path from "node:path";
import {
  getNeteaseDailySongs,
  getNeteaseListeningHistory,
  getNeteaseLyric,
  getNeteaseNewSongs,
  getNeteaseSongUrl,
  searchNeteaseSongs
} from "./adapters/netease.js";
import { ensureToneWav } from "./audio.js";
import { getConfig } from "./config.js";

const catalog = [
  {
    id: "local-morning-01",
    title: "Glass Morning",
    artist: "Taudio Session Band",
    mood: "morning",
    bpm: 104,
    frequency: 392,
    secondaryFrequency: 587,
    duration: 18
  },
  {
    id: "local-focus-01",
    title: "Low Orbit Desk",
    artist: "Quiet Circuits",
    mood: "focus",
    bpm: 86,
    frequency: 330,
    secondaryFrequency: 495,
    duration: 22
  },
  {
    id: "local-night-01",
    title: "Neon Side Street",
    artist: "City Tape Unit",
    mood: "night",
    bpm: 96,
    frequency: 247,
    secondaryFrequency: 370,
    duration: 20
  },
  {
    id: "local-evening-01",
    title: "Warm Window",
    artist: "North Room",
    mood: "evening",
    bpm: 78,
    frequency: 294,
    secondaryFrequency: 440,
    duration: 21
  }
];

const discoveryQueries = [
  "Men I Trust indie",
  "HONNE warm R&B",
  "The fin. night pop",
  "keshi R&B",
  "SZA R&B",
  "Owl City synth pop",
  "NEFFEX focus",
  "FKJ chill",
  "Sunset Rollercoaster city pop",
  "No Vacation dream pop"
];

const englishProfileQueries = [
  "Post Malone",
  "The Chainsmokers",
  "The Weeknd",
  "Machine Gun Kelly",
  "Imagine Dragons",
  "OneRepublic",
  "NEFFEX",
  "ILLENIUM",
  "Vicetone",
  "Kygo",
  "The Score",
  "SZA",
  "Frank Ocean",
  "HONNE"
];

const genericTerms = [
  "华语",
  "流行",
  "城市",
  "城市感",
  "专注",
  "工作",
  "学习",
  "放松",
  "夜晚",
  "清晨",
  "舒缓",
  "chill",
  "focus",
  "pop",
  "r&b",
  "indie"
];

const englishAdjacentArtists = [
  "ILLENIUM",
  "Vicetone",
  "Kygo",
  "Zedd",
  "Avicii",
  "Lauv",
  "blackbear",
  "Halsey",
  "The Kid LAROI",
  "Jeremy Zucker",
  "Joji",
  "LANY",
  "Troye Sivan",
  "Gryffin",
  "Said The Sky",
  "Madeon",
  "Porter Robinson",
  "M83",
  "CHVRCHES",
  "ODESZA",
  "SZA",
  "Frank Ocean",
  "HONNE"
];

const lowQualityTitleTerms = ["karaoke", "instrumental karaoke", "伴奏", "翻唱", "cover version", "type beat", "bootleg"];
const lowQualityExactTitles = new Set(["r&b", "melodic", "pop", "edm", "chill", "focus", "night"]);
const explicitAvoidMarkers = ["不要", "别放", "别播", "别推荐", "不想听", "避开", "skip", "avoid"];
const freshnessMarkers = [
  "没听过",
  "没放过",
  "别重复",
  "不重复",
  "不要听过",
  "新的",
  "新鲜",
  "换一首",
  "别太熟",
  "不太熟",
  "冷门",
  "小众",
  "another",
  "new",
  "fresh"
];
const englishMarkers = ["英文", "英语", "english", "western"];
const chineseMarkers = ["中文", "华语", "国语", "粤语", "chinese", "mandarin", "cantonese"];

export function listCatalog() {
  return catalog;
}

export function searchMusic(query = "") {
  const q = query.toLowerCase();
  const matches = catalog.filter((track) =>
    [track.title, track.artist, track.mood].some((value) => value.toLowerCase().includes(q))
  );
  return matches.length ? matches : catalog;
}

function detectMood(query = "", hour = new Date().getHours()) {
  const normalizedQuery = query.toLowerCase();
  if (normalizedQuery.includes("focus") || query.includes("专注") || query.includes("工作") || query.includes("学习")) {
    return "focus";
  }
  if (
    normalizedQuery.includes("evening") ||
    normalizedQuery.includes("night") ||
    query.includes("晚上") ||
    query.includes("今晚") ||
    query.includes("夜") ||
    query.includes("放松") ||
    query.includes("睡前")
  ) {
    return "evening";
  }
  if (normalizedQuery.includes("morning") || query.includes("早") || query.includes("清晨")) return "morning";
  return hour < 11 ? "morning" : hour >= 20 ? "evening" : "night";
}

export function pickTrack({ query, recent = [], hour = new Date().getHours() } = {}) {
  const recentIds = new Set(recent.map((item) => item.track_id ?? item.id));
  const mood = detectMood(query, hour);
  const pool = searchMusic(query || mood).filter((track) => !recentIds.has(track.id));
  return pool[0] ?? catalog.find((track) => track.mood === mood) ?? catalog[0];
}

export function withPlayableUrl(rootDir, track) {
  const fileName = `${track.id}.wav`;
  const filePath = path.join(rootDir, "cache", "music", fileName);
  ensureToneWav(filePath, {
    duration: track.duration,
    frequency: track.frequency,
    secondaryFrequency: track.secondaryFrequency,
    volume: 0.22
  });
  return {
    ...track,
    url: `/audio/${fileName}`,
    provider: "local-synth"
  };
}

function normalizeKey(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function canonicalTitle(value = "") {
  return normalizeKey(value)
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, " ")
    .replace(/^[^-]{1,64}\s+-\s+/g, " ")
    .replace(/\b(?:remix|mix|bootleg|version|edit|live|radio)\b/g, " ")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCjk(value = "") {
  return /[\u3400-\u9fff]/.test(value);
}

function isGenericQuery(query = "") {
  const normalized = normalizeKey(query);
  if (!normalized) return true;
  const tokens = normalized.split(/[\s,，、]+/).filter(Boolean);
  if (tokens.length <= 1) return false;
  const genericCount = tokens.filter((token) => genericTerms.some((term) => normalizeKey(term) === token)).length;
  return genericCount >= Math.max(2, Math.ceil(tokens.length * 0.6));
}

function wantsFreshDiscovery(text = "") {
  const normalized = normalizeKey(text);
  return freshnessMarkers.some((marker) => normalized.includes(normalizeKey(marker)));
}

function wantsEnglish(text = "") {
  const normalized = normalizeKey(text);
  return englishMarkers.some((marker) => normalized.includes(normalizeKey(marker)));
}

function wantsChinese(text = "") {
  const normalized = normalizeKey(text);
  return chineseMarkers.some((marker) => normalized.includes(normalizeKey(marker)));
}

function profilePrefersEnglish(profile = "") {
  return (
    /(?:英语|英文|english)[^\n]{0,32}(?:90\s*%|绝对统治|绝对多数|占据绝对|为主|优先)/i.test(profile) ||
    /(?:喜欢的语言|language)[^\n]*(?:英语|英文|english)[^\n]*(?:少量|少数)[^\n]*(?:华语|中文)/i.test(profile)
  );
}

function extractPreferredArtists(profile = "") {
  const line = profile.match(/喜欢的歌手[：:]\s*([^\n]+)/)?.[1] || "";
  return line
    .split(/[、,，]/)
    .map((artist) => artist.replace(/（[^）]*）|\([^)]*\)/g, "").replace(/[。.;；]+$/g, "").trim())
    .filter(Boolean);
}

function splitAvoidFragment(fragment = "") {
  return fragment
    .split(/[，,。.;；、/]| 和 | and /i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40);
}

function extractAvoidTerms(...texts) {
  const terms = new Set();
  const source = texts.filter(Boolean).join(" ");
  for (const marker of explicitAvoidMarkers) {
    const pattern = new RegExp(`${marker}\\s*([^，,。.;；\\n]+)`, "gi");
    for (const match of source.matchAll(pattern)) {
      for (const term of splitAvoidFragment(match[1])) terms.add(normalizeKey(term));
    }
  }
  return terms;
}

export function buildSelectionConstraints(query = "", userInput = "", listenerProfile = "", options = {}) {
  const combined = `${query} ${userInput}`;
  const explicitlyEnglish = wantsEnglish(userInput);
  const requestedNamedTrack = /(?:想听|播放|放|来一首|推荐)[^。！？]*?(?:的|《)/.test(userInput);
  const requestedNamedChineseTrack =
    requestedNamedTrack && hasCjk(query);
  const explicitlyChinese = wantsChinese(userInput) || requestedNamedChineseTrack;
  const exploresBeyondFavorites =
    !requestedNamedTrack && (Boolean(options.discover) || wantsFreshDiscovery(combined) || /推荐|recommend/i.test(userInput));
  const preferredArtists = exploresBeyondFavorites
    ? englishAdjacentArtists
    : [...extractPreferredArtists(listenerProfile), ...englishAdjacentArtists];
  return {
    avoidTerms: extractAvoidTerms(userInput, query),
    avoidRecentArtists: wantsFreshDiscovery(combined),
    preferEnglish: !explicitlyChinese && (explicitlyEnglish || profilePrefersEnglish(listenerProfile)),
    preferChinese: explicitlyChinese && !explicitlyEnglish,
    profilePrefersEnglish: profilePrefersEnglish(listenerProfile),
    preferredArtists,
    restrictToProfileArtists: profilePrefersEnglish(listenerProfile) && !explicitlyChinese && !requestedNamedTrack,
    exploresBeyondFavorites
  };
}

function shouldSkipCandidate(track, recentKeys, options = {}) {
  const { allowRepeats = false, constraints = {} } = options;
  if (!track?.id) return true;
  const id = String(track.id);
  const title = normalizeKey(track.title);
  const artist = normalizeKey(track.artist);
  const pair = `${title}::${artist}`;
  if (!allowRepeats && (recentKeys.ids.has(id) || recentKeys.pairs.has(pair) || recentKeys.titles.has(canonicalTitle(track.title)))) {
    return true;
  }
  if (constraints.avoidRecentArtists && !allowRepeats && recentKeys.recentArtists.has(artist)) return true;
  if ([...(constraints.avoidTerms ?? [])].some((term) => title.includes(term) || artist.includes(term))) return true;
  if (constraints.preferEnglish && hasCjk(`${track.title}${track.artist}`)) return true;
  if (constraints.preferChinese && !hasCjk(`${track.title}${track.artist}`)) return true;
  if (lowQualityTitleTerms.some((term) => title.includes(term))) return true;
  if (lowQualityExactTitles.has(title)) return true;
  if (
    constraints.restrictToProfileArtists &&
    !(constraints.preferredArtists || []).some((preferredArtist) => artist.includes(normalizeKey(preferredArtist)))
  ) {
    return true;
  }
  return false;
}

function buildRecentKeys(recent = []) {
  return {
    ids: new Set(recent.map((item) => String(item.track_id ?? item.id))),
    pairs: new Set(recent.map((item) => `${normalizeKey(item.title)}::${normalizeKey(item.artist)}`)),
    titles: new Set(recent.map((item) => canonicalTitle(item.title)).filter(Boolean)),
    recentArtists: new Set(recent.slice(0, 12).map((item) => normalizeKey(item.artist)).filter(Boolean))
  };
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (!candidate?.id || seen.has(String(candidate.id))) continue;
    seen.add(String(candidate.id));
    result.push(candidate);
  }
  return result;
}

function buildQueryPlan(query, hour, constraints = {}) {
  const mood = detectMood(query, hour);
  const exactFirst = query && !isGenericQuery(query) && !(constraints.preferEnglish && hasCjk(query));
  const languageQueries = constraints.preferEnglish
    ? constraints.exploresBeyondFavorites
      ? englishAdjacentArtists
      : englishProfileQueries
    : constraints.preferChinese
      ? ["Gareth.T R&B", "告五人 流行", "落日飞车 city pop", "王若琳 R&B", "陈绮贞 indie"]
      : [];
  const moodQueries =
    mood === "focus"
      ? ["NEFFEX focus", "FKJ focus", "Tycho focus", "Bonobo study"]
      : mood === "evening"
        ? ["HONNE warm R&B", "Men I Trust night", "Frank Ocean R&B", "The fin. night pop"]
        : ["Gareth.T R&B", "HYBS morning", "Owl City bright pop", "No Vacation indie"];
  return uniqueStrings([
    ...(exactFirst ? [query] : []),
    ...languageQueries,
    ...moodQueries,
    ...discoveryQueries,
    ...(!exactFirst && query && !constraints.preferEnglish ? [query] : [])
  ]);
}

function uniqueStrings(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collectCandidates(query, hour, constraints = {}, targetCount = 72) {
  const candidates = [];
  const generic = isGenericQuery(query);

  if (generic && !constraints.avoidRecentArtists && !constraints.preferEnglish) {
    candidates.push(...(await getNeteaseDailySongs(45).catch(() => [])));
    candidates.push(...(await getNeteaseNewSongs(30).catch(() => [])));
  }

  for (const searchQuery of buildQueryPlan(query, hour, constraints)) {
    candidates.push(...(await searchNeteaseSongs(searchQuery, 12).catch(() => [])));
    if (candidates.length >= targetCount) break;
  }

  if ((!generic || constraints.avoidRecentArtists) && !constraints.preferEnglish) {
    candidates.push(...(await getNeteaseDailySongs(35).catch(() => [])));
    candidates.push(...(await getNeteaseNewSongs(25).catch(() => [])));
  }

  return uniqueCandidates(candidates);
}

async function firstPlayable(candidates, recentKeys, options = {}) {
  for (const onlineTrack of candidates) {
    if (shouldSkipCandidate(onlineTrack, recentKeys, options)) continue;
    const url = await getNeteaseSongUrl(onlineTrack.id);
    if (!url) continue;
    const lyric = await getNeteaseLyric(onlineTrack.id).catch(() => "");
    return {
      ...onlineTrack,
      url,
      lyric,
      provider: "netease-enhanced"
    };
  }
  return null;
}

function explicitlyRequestsReplay(userInput = "") {
  return /(重播|再放一遍|再听一遍|重复播放|重听)/.test(userInput);
}

export async function resolvePlayableTrack(
  rootDir,
  { query, userInput = "", listenerProfile = "", recent = [], hour = new Date().getHours(), discover = false } = {}
) {
  const config = getConfig();
  const localTrack = withPlayableUrl(rootDir, pickTrack({ query, recent, hour }));
  const useRealtimeMusic = Boolean(config.netease.baseUrl);
  try {
    const listeningHistory = await getNeteaseListeningHistory(100).catch(() => []);
    const recentKeys = buildRecentKeys([...recent, ...listeningHistory]);
    const constraints = buildSelectionConstraints(query, userInput, listenerProfile, { discover });
    let candidates = await collectCandidates(query || localTrack.mood, hour, constraints);
    let fresh = await firstPlayable(candidates, recentKeys, { allowRepeats: false, constraints });
    if (fresh) return fresh;
    if (constraints.avoidRecentArtists) {
      candidates = await collectCandidates(query || localTrack.mood, hour, constraints, 192);
      fresh = await firstPlayable(candidates, recentKeys, { allowRepeats: false, constraints });
      if (fresh) return fresh;
    }
    if (constraints.exploresBeyondFavorites) {
      throw new Error("no-fresh-profile-aligned-track");
    }
    const relaxedFresh = await firstPlayable(candidates, recentKeys, {
      allowRepeats: false,
      constraints: { ...constraints, avoidRecentArtists: false }
    });
    if (relaxedFresh) return { ...relaxedFresh, repeatedBecause: "No candidate survived the recent-artist filter." };
    if (explicitlyRequestsReplay(userInput)) {
      const repeated = await firstPlayable(candidates, recentKeys, { allowRepeats: true, constraints });
      if (repeated) return repeated;
    }
    if (useRealtimeMusic && config.realtime.strict) {
      throw new Error("no-playable-online-track");
    }
    return { ...localTrack, fallbackReason: "Netease returned no playable URL" };
  } catch (error) {
    if (useRealtimeMusic && config.realtime.strict) {
      throw error;
    }
    return {
      ...localTrack,
      fallbackReason: error.message
    };
  }
}

export async function resolvePlayableTrackById(rootDir, { id, title = "", artist = "" } = {}) {
  const config = getConfig();
  const localTrack = catalog.find((track) => track.id === String(id));
  if (localTrack) return withPlayableUrl(rootDir, localTrack);
  if (!config.netease.baseUrl || !id) {
    throw new Error("track-id-playback-unavailable");
  }
  const url = await getNeteaseSongUrl(id);
  if (!url) throw new Error("track-id-has-no-playable-url");
  const lyric = await getNeteaseLyric(id).catch(() => "");
  return {
    id: String(id),
    title: title || "Untitled",
    artist: artist || "Unknown Artist",
    album: "",
    mood: "online",
    bpm: null,
    url,
    lyric,
    provider: "netease-enhanced"
  };
}
