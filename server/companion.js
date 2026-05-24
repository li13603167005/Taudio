import { getConfig } from "./config.js";
import { askDeepSeekCompanion } from "./adapters/deepseek.js";
import { cleanPublicText } from "./infra.js";

function isTalkingAboutCurrentTrack(input = "") {
  return /(这首|这歌|现在这首|正在放|为什么.*推荐|为什么.*选|歌词|写什么|讲什么|表达什么)/.test(input);
}

function groundedTrackReply(input, track, trackInsight = "") {
  const song = `${track.artist} 的《${track.title}》`;
  const anchor = trackInsight || "我现在只能从听感和歌词出发，还没有查到可靠的创作背景。";
  const asksForBackground = /(背景|创作|写作)/.test(input);
  if (/为什么.*(推荐|选|放)/.test(input)) {
    const sourceBoundary = asksForBackground ? " 具体创作背景我还没有可靠出处，所以这里不替歌手补故事。" : "";
    return `我选 ${song}，原因在这里：${anchor}${sourceBoundary} 你更被其中的画面抓住，还是旋律的推进？`;
  }
  if (/(背景|创作|写什么|讲什么|表达什么|歌词)/.test(input)) {
    return `${anchor} 至于更具体的创作背景，我还没有可靠出处，不想替歌手编故事。`;
  }
  return `${song} 最打动人的地方在于：${anchor} 你听到哪一处最有感觉？`;
}

function fallbackCompanionReply(input, context, track, trackInsight = "") {
  const hour = context.fragments.environment.time?.hour ?? new Date().getHours();
  const name = context.fragments.user?.name || "";
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const prefix = name && name !== "默认用户" ? `${name}，` : "";
  const current = track?.title ? `《${track.title}》先继续放着。` : "";

  if (/早上好|早安|morning/i.test(input)) {
    return `${greeting}，${prefix}我在。${current || "今天想从什么心情开始？"}`;
  }
  if (/你好|嗨|hello|hi/i.test(input)) {
    return `嗨，${prefix}我在这里。${current || "想聊聊，还是等会儿让我给你接一首歌？"}`;
  }
  if (/累|疲惫|难受|烦|压力|下班|结束/.test(input)) {
    return `${prefix}辛苦了。我先陪你缓一缓，不急着换歌。${current}`;
  }
  if (track?.title && isTalkingAboutCurrentTrack(input)) {
    return groundedTrackReply(input, track, trackInsight);
  }
  return `${prefix}我听到了。${current || "我可以陪你聊一会儿；想听歌时再告诉我。"}`;
}

function overstepsIntoPlayback(text = "") {
  return /(找一首|放一首|来一首|推荐一首|接一首|换一首|为你播放|给你放|歌陪你|音乐陪你)/.test(text);
}

export async function replyAsCompanion(input, context, track, trackInsight = "") {
  if (/^\s*(早上好|早安|上午好|你好|嗨|hello|hi)[！!。.？?\s]*$/i.test(input)) {
    return cleanPublicText(fallbackCompanionReply(input, context, track, trackInsight), 180);
  }
  if (track?.title && isTalkingAboutCurrentTrack(input)) {
    return cleanPublicText(groundedTrackReply(input, track, trackInsight), 300);
  }
  const config = getConfig();
  if (config.brain.provider === "deepseek" && config.deepseek.apiKey) {
    try {
      const answer = await askDeepSeekCompanion(input, context, track, trackInsight);
      if (answer && !overstepsIntoPlayback(answer)) return cleanPublicText(answer, 260);
    } catch {
      // Use a local companion reply if the conversational model is unavailable.
    }
  }
  return cleanPublicText(fallbackCompanionReply(input, context, track, trackInsight), 220);
}
