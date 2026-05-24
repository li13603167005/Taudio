import { getConfig } from "../config.js";
import { fetchJson, joinUrl } from "./http.js";

export async function askDeepSeek(input, context) {
  const { deepseek } = getConfig();
  if (!deepseek.apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const systemPrompt = [
    "You are Taudio's radio brain.",
    "Use the provided local time in Asia/Shanghai as the listener's real current time.",
    "Never describe the moment as late night or early morning unless the local hour is actually late-night/early-morning.",
    "Return strict JSON only. Do not wrap it in markdown.",
    "The JSON shape must be:",
    "{\"say\":\"中文DJ串词\",\"play\":\"NetEase search query\",\"reason\":\"brief internal reason\",\"segue\":\"transition style\"}",
    "Rules:",
    "- say: natural Chinese DJ line, 25-55 Chinese characters. It should sound like a live DJ responding to the listener, not a system message.",
    "- play: a concrete NetEase Cloud Music search query. Prefer artist + song, or artist + style.",
    "- For English music, include a likely artist name plus genre or song mood, for example: \"SZA R&B night\", \"Frank Ocean Pink + White\", \"The Weeknd chill R&B\".",
    "- For discovery, avoid only generic tags. Use seed artists or scenes, for example: \"HYBS indie pop\", \"Gareth.T R&B\", \"Men I Trust night\".",
    "- Avoid generic library phrases such as relaxing music, sleep music, study music, background music, cloudy night, or pure mood words.",
    "- Avoid tracks and artists listed in recent plays unless the user explicitly asks for them.",
    "- If the listener asks for recommendations, explore something adjacent rather than repeating familiar hits.",
    "- If the listener asks for English songs, play may be English. If the listener asks for Chinese songs, play may be Chinese.",
    "- reason: concise internal explanation.",
    "- segue: describe how to move from speech into music."
  ].join("\n");

  const data = await fetchJson(joinUrl(deepseek.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${deepseek.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${context.prompt}\n\nUser request: ${input}\n\nReturn json now.` }
      ],
      response_format: { type: "json_object" },
      temperature: deepseek.temperature,
      max_tokens: Math.max(deepseek.maxTokens, 900),
      stream: false
    }),
    timeoutMs: deepseek.timeoutMs
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned empty content");
  }
  return JSON.parse(content);
}

function lyricExcerpt(track) {
  return String(track?.lyric || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+\]/g, "").trim())
    .filter((line) => line && !/作词|作曲|编曲|制作人|producer|composer|lyricist/i.test(line))
    .slice(0, 12)
    .join(" / ")
    .slice(0, 500);
}

export async function askDeepSeekCompanion(input, context, currentTrack, currentInsight = "") {
  const { deepseek } = getConfig();
  if (!deepseek.apiKey) return "";

  const trackText = currentTrack?.title
    ? `${currentTrack.artist || "未知歌手"} 的《${currentTrack.title}》`
    : "当前没有正在播放的歌曲";
  const companionContext = {
    listener: context.fragments.user?.name || "听众",
    listenerProfile: String(context.fragments.user?.profile || "").slice(0, 700),
    localTime: context.fragments.environment.time?.label || "",
    currentlyPlaying: {
      label: trackText,
      album: currentTrack?.album || "",
      lyricExcerpt: lyricExcerpt(currentTrack),
      preparedInsight: currentInsight
    },
    recentMessages: context.fragments.memory?.messages?.slice(-8) || []
  };
  const data = await fetchJson(joinUrl(deepseek.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${deepseek.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: deepseek.model,
      messages: [
        {
          role: "system",
          content: [
            "You are Taudio, a warm private-radio companion speaking Chinese.",
            "This is conversation only. Do not recommend, change, or announce a song unless the listener explicitly requests music.",
            "Treat the song currently playing as a shared object you and the listener can discuss, not as an item in a recommendation list.",
            "Respond to what the listener is feeling or noticing before offering information.",
            "When asked about the current song, use the provided title, artist, album and lyrics. If no sourced creation background is supplied, discuss lyrical meaning or listening impression and never invent the artist's intent or a backstory.",
            "Avoid hollow phrases such as '我听到了' or repeated weather reports.",
            "Reply naturally in 1-3 sentences. A small, specific follow-up question is welcome when it genuinely continues the conversation.",
            "No system wording and no mention of APIs. Use the supplied Asia/Shanghai local time appropriately."
          ].join("\n")
        },
        {
          role: "user",
          content: `Context: ${JSON.stringify(companionContext)}\nListener said: ${input}\nReply only with the spoken response.`
        }
      ],
      temperature: 0.7,
      max_tokens: Math.max(deepseek.maxTokens, 650),
      stream: false
    }),
    timeoutMs: Math.min(deepseek.timeoutMs, 12000)
  });

  const content = String(data.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim();
  if (!content) return "";
  if (content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content);
      return String(parsed.say || parsed.reply || parsed.text || "").trim();
    } catch {
      return "";
    }
  }
  return content;
}

export async function askTrackInsight(track) {
  const { deepseek } = getConfig();
  if (!deepseek.apiKey) return null;

  const lyric = String(track?.lyric || "")
    .split(/\r?\n/)
    .slice(0, 28)
    .join("\n")
    .slice(0, 1600);
  const title = track?.title || "";
  const artist = track?.artist || "";
  if (!title || !artist) return null;

  const systemPrompt = [
    "You write short music context for a private AI radio DJ.",
    "Return strict JSON only: {\"insight\":\"...\"}.",
    "Write Chinese, 38-86 Chinese characters.",
    "Give the DJ one concrete, worthwhile talking point anchored in the supplied song metadata or lyric excerpt.",
    "Only mention a writing or release background when it is present in supplied data. Otherwise discuss lyrical meaning, imagery, tension, or emotional movement.",
    "Do not mention user comments, NetEase comments, rankings, APIs, or uncertainty.",
    "Never invent a biographical story, an artist intention, or a creation occasion.",
    "Avoid generic filler such as '很适合此刻' or '让我们沉浸其中'. Keep it warm and useful for a DJ segue."
  ].join("\n");

  const data = await fetchJson(joinUrl(deepseek.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${deepseek.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Song: ${title}\nArtist: ${artist}\nAlbum: ${track?.album || "(unknown)"}\nLyrics excerpt:\n${lyric || "(no lyrics available)"}\n\nReturn json now.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: Math.max(deepseek.maxTokens, 700),
      stream: false
    }),
    timeoutMs: Math.min(deepseek.timeoutMs, 12000)
  });

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned no track insight content");
  const parsed = JSON.parse(content);
  const insight = String(parsed.insight || "").replace(/\s+/g, " ").trim();
  return insight ? insight.slice(0, 110) : null;
}
