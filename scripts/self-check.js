import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUserIntent } from "../server/intent.js";
import { buildSelectionConstraints } from "../server/music.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Keep the public self-check deterministic and offline-friendly. A developer's
// local .env may contain real API keys/cookies, but this check should not rely
// on any external provider.
process.env.BRAIN_PROVIDER = "local";
process.env.TAUDIO_USE_CLAUDE = "0";
process.env.DEEPSEEK_API_KEY = "";
process.env.MUSIC_PROVIDER = "local-synth";
process.env.NETEASE_API_BASE = "";
process.env.NETEASE_COOKIE = "";
process.env.OPENWEATHER_API_KEY = "";

const requiredFiles = [
  "server/app.js",
  "server/router.js",
  "server/context.js",
  "server/brain.js",
  "server/time.js",
  "server/claude.js",
  "server/scheduler.js",
  "server/tts.js",
  "public/index.html",
  "public/app.js",
  "public/sw.js",
  "user/taste.md",
  "prompts/ai-persona.md"
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(rootDir, file)), `Missing ${file}`);
}

assert.equal(classifyUserIntent("为什么推荐这首歌？它有什么创作背景？"), "conversation");
assert.equal(classifyUserIntent("推荐一首有内容的英文歌"), "play");
const englishDominantProfile = "喜欢的语言：英语（占据绝对统治地位，占比超 90%）、少量的质感华语。";
const switchSongConstraints = buildSelectionConstraints("Gareth.T R&B", "换一首", englishDominantProfile);
assert.equal(switchSongConstraints.preferEnglish, true);
assert.equal(switchSongConstraints.preferChinese, false);
assert.equal(switchSongConstraints.exploresBeyondFavorites, true);
assert.equal(buildSelectionConstraints("Post Malone", "启动 Taudio 私人电台", englishDominantProfile, { discover: true }).exploresBeyondFavorites, true);
const explicitChineseConstraints = buildSelectionConstraints("邓紫棋 光年之外", "我想听邓紫棋的《光年之外》", englishDominantProfile);
assert.equal(explicitChineseConstraints.preferChinese, true);
assert.equal(explicitChineseConstraints.restrictToProfileArtists, false);

const { createTaudioServer } = await import("../server/app.js");
const app = await createTaudioServer({ port: 0 });
try {
  const now = await fetch(`${app.url}/api/now`).then((res) => res.json());
  assert.ok(["ready", "error"].includes(now.state));
  assert.ok(now.sequence.length >= 1);

  const wsUrl = app.url.replace("http://", "ws://") + "/stream";
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const providers = await fetch(`${app.url}/api/providers`).then((res) => res.json());
  assert.equal(providers.realtime.strict, true);
  assert.equal(providers.music.provider, "local-synth");
  assert.equal(providers.tts.provider, "browser-speech");

  const users = await fetch(`${app.url}/api/users`).then((res) => res.json());
  assert.ok(users.users.some((user) => user.id === "default"));
  const profile = await fetch(`${app.url}/api/user-profile?userId=default`).then((res) => res.json());
  assert.equal(profile.user.id, "default");
  assert.ok(profile.profile.length > 0);

  const chat = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "我想听邓紫棋的光年之外" })
  }).then((res) => res.json());
  assert.ok(["ready", "error"].includes(chat.state));
  if (chat.state === "ready") {
    assert.ok(chat.track.url);
    assert.equal(chat.track.provider, "local-synth");
  }
  assert.equal(chat.voice.provider, "browser-speech");
  assert.equal(chat.voice.url, null);
  assert.ok(chat.voice.text.length > 0);

  const evening = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "放一首 Frank Ocean 的 Pink + White" })
  }).then((res) => res.json());
  assert.ok(["ready", "error"].includes(evening.state));
  if (evening.state === "ready") assert.ok(evening.track.url);
  if (evening.state === "ready") {
    const countBeforeDiscussion = (await fetch(`${app.url}/api/taste`).then((res) => res.json())).recent.length;
    const discussion = await fetch(`${app.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "为什么推荐这首歌？它有什么创作背景？" })
    }).then((res) => res.json());
    const countAfterDiscussion = (await fetch(`${app.url}/api/taste`).then((res) => res.json())).recent.length;
    assert.equal(discussion.state, "conversation");
    assert.equal(discussion.track.id, evening.track.id);
    assert.match(discussion.voice.text, /可靠出处/);
    assert.equal(countAfterDiscussion, countBeforeDiscussion);
    const queued = await fetch(`${app.url}/api/play-track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: evening.track.id, title: evening.track.title, artist: evening.track.artist })
    }).then((res) => res.json());
    assert.equal(queued.voice, null);
    assert.equal(queued.sequence.length, 1);
    assert.equal(queued.sequence[0].kind, "music");
  }

  const html = await fetch(app.url).then((res) => res.text());
  assert.match(html, /Taudio/);

  const plan = await fetch(`${app.url}/api/plan/today`).then((res) => res.json());
  assert.ok(plan.blocks.length >= 4);

  const providerCheck = await fetch(`${app.url}/api/providers/check`).then((res) => res.json());
  assert.ok(["online", "degraded", "offline", "disabled"].includes(providerCheck.music.status));
  assert.ok(providerCheck.weather.summary);
  assert.equal(providerCheck.tts.provider, "browser-speech");

  const musicPath = path.join(rootDir, "cache", "music");
  assert.ok(fs.readdirSync(musicPath).some((file) => file.endsWith(".wav")));

  console.log(`Self-check passed at ${app.url}`);
} finally {
  await app.close();
}
