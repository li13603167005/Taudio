const playTerms = [
  "播放",
  "给我放",
  "放点",
  "放一首",
  "来首",
  "来一首",
  "推荐",
  "推荐一首",
  "推荐歌",
  "推荐音乐",
  "听一首",
  "听歌",
  "想听",
  "换一首",
  "下一首",
  "切歌",
  "点播",
  "歌单",
  "音乐",
  "专注模式",
  "focus mode",
  "play ",
  "recommend ",
  "song",
  "music"
];

const currentTrackDiscussionPatterns = [
  /为什么.*(推荐|选|放).*(这首|它|这个)/,
  /(这首歌|这首|这歌|现在这首|正在放).*(讲|写|表达|意思|背景|歌词|好听|喜欢|怎么样)/,
  /(讲讲|介绍|聊聊|说说).*(这首歌|这首|这歌|现在放|正在放)/,
  /(我喜欢|我不喜欢|不太喜欢|别再放).*(这首|这歌|这个)/
];

export function classifyUserIntent(input = "") {
  const normalized = String(input).trim().toLowerCase();
  if (!normalized) return "conversation";
  if (currentTrackDiscussionPatterns.some((pattern) => pattern.test(normalized))) return "conversation";
  return playTerms.some((term) => normalized.includes(term.toLowerCase())) ? "play" : "conversation";
}
