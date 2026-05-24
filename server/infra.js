export function createDiagnostics() {
  const items = [];
  return {
    add(scope, message, detail = {}) {
      items.push({
        scope,
        message: String(message || ""),
        detail,
        at: new Date().toISOString()
      });
    },
    list() {
      return items;
    }
  };
}

export function cleanPublicText(text = "", maxLength = 320) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/Netease enhanced returned no playable URL[^。.!?]*/gi, "")
    .replace(/no-playable-online-track/gi, "")
    .trim()
    .slice(0, maxLength);
}

export function compactInsight(insight) {
  if (!insight) return "";
  return String(insight || "").trim();
}

export function deriveLyricInsight(track) {
  const lyric = String(track?.lyric || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\[[^\]]+\]/g, "")
        .replace(/作词|作曲|编曲|制作人|混音|母带|录音|和声|吉他|贝斯|鼓|键盘|人声/gi, "")
        .trim()
    )
    .filter((line) => line.length >= 8 && line.length <= 80)
    .filter((line) => !/[:：]/.test(line))
    .filter((line) => !/lyric|lyrics|mixing|master|producer|produced|written|composer|arranger|vocal|guitar|bass|drum|keyboard/i.test(line));
  const line = lyric.find((item) => /爱|梦|夜|痛|走|等|孤独|自由|heart|love|night|good|alone|dream|home/i.test(item)) || lyric[0];
  if (!line) return track?.title ? `它的重点不在复杂故事，而是在旋律里铺开一种可以停留片刻的情绪。` : "";
  const excerpt = /[\u3400-\u9fff]/.test(line)
    ? line.slice(0, 34)
    : line.split(/\s+/).slice(0, 9).join(" ");
  return `“${excerpt}”把情绪落在一个具体瞬间里，不急着讲道理，而是让那段心境慢慢显出来。`;
}

export function isFreshnessRequest(input = "") {
  return ["没听过", "没放过", "别重复", "不重复", "不要听过", "新的", "新鲜", "换一首", "别太熟", "不太熟", "冷门", "小众", "another", "new", "fresh"].some(
    (term) => input.toLowerCase().includes(term.toLowerCase())
  );
}
