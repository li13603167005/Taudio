import { addMessage, addPlay, recentPlays, recentPlaysWithinHours } from "./state.js";
import { askBrain } from "./brain.js";
import { buildContext } from "./context.js";
import { resolvePlayableTrack, resolvePlayableTrackById, listCatalog } from "./music.js";
import { buildTodayPlan } from "./scheduler.js";
import { synthesizeSpeech } from "./tts.js";
import { getProviderStatus } from "./config.js";
import { getWeatherSummary } from "./adapters/weather.js";
import { checkNeteaseHealth } from "./adapters/netease.js";
import { askTrackInsight } from "./adapters/deepseek.js";
import { getUserProfile, listUsers, normalizeUserId, saveUserProfile } from "./users.js";
import { cleanPublicText, createDiagnostics, deriveLyricInsight } from "./infra.js";
import { classifyUserIntent } from "./intent.js";
import { replyAsCompanion } from "./companion.js";

function withTrackIntro(text, track) {
  const title = track?.title || "";
  const artist = track?.artist || "";
  if (!title) return text;
  const alreadyMentionsTrack = text.includes(title) && (!artist || text.includes(artist));
  if (alreadyMentionsTrack) return text;
  const intro = artist ? `接下来是 ${artist} 的《${title}》。` : `接下来是《${title}》。`;
  return `${text} ${intro}`.slice(0, 320);
}

function includesAny(text = "", terms = []) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function isLeakyDjLine(text = "") {
  return /(候选|外面是|体感|这首歌更像|从歌词看|上一首落下|顺着刚才|避开刚听过|避开了最近|网易云|完整播放|记住了，换一点|好，接回)/.test(text);
}

function cleanDjLine(text = "") {
  const cleaned = cleanPublicText(text, 120);
  return isLeakyDjLine(cleaned) ? "" : cleaned;
}

function cleanTrackInsight(text = "") {
  return cleanPublicText(text, 160).replace(/^从歌词看[，,：:]?\s*/u, "");
}

function composeDjIntro(input, decision, track, _context, source = "chat", trackInsight = "") {
  const title = track?.title || "";
  const artist = track?.artist || "这位音乐人";
  if (!title) return cleanDjLine(decision.say) || "我在。";
  const insight = cleanTrackInsight(trackInsight);

  if (source === "queue") return "";
  return [`${artist} 的《${title}》。`, insight].filter(Boolean).join(" ");
}

function friendlyMusicError() {
  return "这次没有拿到完整可播版本。你可以换个具体歌手、歌名或风格再试。";
}

function emptyState(userId = "default") {
  return {
    userId,
    state: "idle",
    sequence: [],
    track: null,
    voice: null,
    updatedAt: new Date().toISOString()
  };
}

function isRoutineTransition(input = "", source = "chat") {
  if (source === "startup" || source === "autoplay") return true;
  return /^\s*(换一首|再换一首|再换首|下一首|切歌)[！!。.？?\s]*$/.test(input);
}

export function createRadioRouter({ rootDir, broadcast }) {
  const currentByUser = new Map();

  function getCurrent(userId = "default") {
    const id = normalizeUserId(userId);
    if (!currentByUser.has(id)) currentByUser.set(id, emptyState(id));
    return currentByUser.get(id);
  }

  function setCurrent(userId, value) {
    const id = normalizeUserId(userId);
    currentByUser.set(id, { ...value, userId: id });
    return currentByUser.get(id);
  }

  async function makeSequence(input, source = "chat", userId = "default", options = {}) {
    const id = normalizeUserId(userId);
    const diagnostics = createDiagnostics();
    if (source === "chat") addMessage("user", input, id);
    const context = await buildContext(rootDir, input, { source, userId: id });
    const decision = options.play
      ? {
          say: options.say || "",
          play: options.play,
          reason: "Queue item selected directly by the listener.",
          segue: "direct queue playback"
        }
      : isRoutineTransition(input, source)
        ? {
            say: "",
            play: "",
            reason: "Routine transition delegated directly to profile-aware discovery.",
            segue: "clean entry"
          }
      : await askBrain(input, context);
    diagnostics.add("brain", "decision", { play: decision.play, reason: decision.reason, source });
    let track = null;
    try {
      track = options.trackId
        ? await resolvePlayableTrackById(rootDir, {
            id: options.trackId,
            title: options.title,
            artist: options.artist
          })
        : await resolvePlayableTrack(rootDir, {
            query: decision.play,
            userInput: input,
            listenerProfile: context.fragments.user.profile,
            recent: recentPlays(60, id),
            hour: new Date().getHours(),
            discover: source === "startup" || source === "autoplay"
          });
    } catch (error) {
      diagnostics.add("music", error.message, { input, play: decision.play });
      const errorText = friendlyMusicError();
      const voice = await synthesizeSpeech(rootDir, errorText);
      addMessage("assistant", errorText, id);
      const current = setCurrent(id, {
        state: "error",
        input,
        decision,
        error: errorText,
        diagnostic: error.message,
        infra: { diagnostics: diagnostics.list() },
        voice,
        track: null,
        sequence: [
          { kind: "voice", title: "Taudio", artist: "AI DJ", url: voice.url, text: voice.text, provider: voice.provider }
        ],
        updatedAt: new Date().toISOString()
      });
      broadcast({ type: "now-playing", payload: current });
      return current;
    }

    diagnostics.add("music", "selected", {
      id: track.id,
      title: track.title,
      artist: track.artist,
      provider: track.provider,
      hasLyric: Boolean(track.lyric)
    });
    const trackInsight = source === "queue" ? "" : cleanPublicText((await askTrackInsight(track).catch((error) => {
      diagnostics.add("insight", error.message, { title: track.title, artist: track.artist });
      return "";
    })) || deriveLyricInsight(track), 160);
    if (trackInsight) diagnostics.add("insight", "selected", { insight: trackInsight });
    const voiceText =
      source === "queue" ? "" : withTrackIntro(composeDjIntro(input, decision, track, context, source, trackInsight), track);
    const voice = voiceText ? await synthesizeSpeech(rootDir, voiceText) : null;
    if (voiceText) addMessage("assistant", voiceText, id);
    if (track) addPlay(track, source, id);

    const sequence = [
      ...(voice ? [{ kind: "voice", title: "Taudio", artist: "AI DJ", url: voice.url, text: voice.text, provider: voice.provider }] : []),
      { kind: "music", id: track.id, title: track.title, artist: track.artist, url: track.url, mood: track.mood, provider: track.provider }
    ];
    const current = setCurrent(id, {
      state: "ready",
      input,
      decision,
      infra: {
        diagnostics: diagnostics.list(),
        trackInsight: trackInsight || ""
      },
      voice,
      track,
      sequence,
      updatedAt: new Date().toISOString()
    });
    broadcast({ type: "now-playing", payload: current });
    return current;
  }

  async function handleChat(body) {
    const message = String(body?.message || "").trim();
    if (!message) {
      return { error: "message is required" };
    }
    if (classifyUserIntent(message) === "conversation") {
      const id = normalizeUserId(body?.userId);
      addMessage("user", message, id);
      const context = await buildContext(rootDir, message, { source: "conversation", userId: id });
      const playingState = getCurrent(id);
      const playing = playingState.track;
      const text = await replyAsCompanion(message, context, playing, playingState.infra?.trackInsight || "");
      const voice = await synthesizeSpeech(rootDir, text);
      addMessage("assistant", text, id);
      const response = {
        userId: id,
        state: "conversation",
        conversation: true,
        voice,
        track: playing,
        updatedAt: new Date().toISOString()
      };
      broadcast({ type: "conversation", payload: response });
      return response;
    }
    return makeSequence(message, "chat", body?.userId);
  }

  async function handleAutoNext(body) {
    const message = String(body?.message || "上一首歌放完了，顺着刚才的氛围继续推荐下一首").trim();
    return makeSequence(message, "autoplay", body?.userId);
  }

  async function handlePlayTrack(body) {
    const title = String(body?.title || "").trim();
    const artist = String(body?.artist || "").trim();
    if (!title) return { error: "title is required" };
    const input = artist ? `播放 ${artist} 的《${title}》` : `播放《${title}》`;
    return makeSequence(input, "queue", body?.userId, {
      trackId: body?.id ? String(body.id) : "",
      title,
      artist,
      play: artist ? `${artist} ${title}` : title,
      say: ""
    });
  }

  async function healthCheckProviders() {
    const weather = await getWeatherSummary();
    const tts = await synthesizeSpeech(rootDir, "Taudio API 自检");
    const music = await checkNeteaseHealth();
    return {
      providers: getProviderStatus(),
      music,
      weather,
      tts: {
        provider: tts.provider,
        url: tts.url,
        fallbackReason: tts.fallbackReason || "",
        text: tts.text
      }
    };
  }

  async function bootstrap(userId = "default") {
    const id = normalizeUserId(userId);
    const current = getCurrent(id);
    if (current.state === "idle") {
      return makeSequence("启动 Taudio 私人电台", "startup", id);
    }
    return current;
  }

  return {
    handleChat,
    handleAutoNext,
    handlePlayTrack,
    bootstrap,
    now: (userId = "default") => getCurrent(userId),
    next: (userId = "default") => {
      const current = getCurrent(userId);
      return { sequence: current.sequence, updatedAt: current.updatedAt };
    },
    taste: (userId = "default") => ({
      catalog: listCatalog(),
      recent: recentPlaysWithinHours(24, 100, normalizeUserId(userId)),
      recentWindowHours: 24
    }),
    todayPlan: () => buildTodayPlan(),
    providers: () => getProviderStatus(),
    healthCheckProviders,
    users: () => listUsers(rootDir),
    userProfile: (userId) => getUserProfile(rootDir, userId),
    saveUserProfile: (userId, profile) => saveUserProfile(rootDir, userId, profile)
  };
}
