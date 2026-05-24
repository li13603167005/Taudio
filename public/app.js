const audio = document.querySelector("#radioAudio");
const playPause = document.querySelector("#playPause");
const nextButton = document.querySelector("#nextButton");
const volume = document.querySelector("#volume");
const progress = document.querySelector("#progress");
const elapsedTime = document.querySelector("#elapsedTime");
const durationTime = document.querySelector("#durationTime");
const listButton = document.querySelector("#listButton");
const queueDrawer = document.querySelector("#queueDrawer");
const queueList = document.querySelector("#queueList");
const queueCount = document.querySelector("#queueCount");
const djLine = document.querySelector("#djLine");
const trackTitle = document.querySelector("#trackTitle");
const trackArtist = document.querySelector("#trackArtist");
const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const currentMood = document.querySelector("#currentMood");
const playCount = document.querySelector("#playCount");
const tasteList = document.querySelector("#tasteList");
const planList = document.querySelector("#planList");
const providerStatus = document.querySelector("#providerStatus");
const userSelect = document.querySelector("#userSelect");
const userForm = document.querySelector("#userForm");
const newUserName = document.querySelector("#newUserName");
const profileForm = document.querySelector("#profileForm");
const profileEditor = document.querySelector("#profileEditor");
const profileStatus = document.querySelector("#profileStatus");
const clockTime = document.querySelector("#clockTime");
const clockDay = document.querySelector("#clockDay");
const clockDate = document.querySelector("#clockDate");
const miniClock = document.querySelector("#miniClock");
const darkModeButton = document.querySelector("#darkModeButton");
const lightModeButton = document.querySelector("#lightModeButton");
const poetryModeButton = document.querySelector("#poetryModeButton");
const focusModeButton = document.querySelector("#focusModeButton");

let sequence = [];
let sequenceIndex = 0;
let nowState = null;
let isSpeaking = false;
let speechTimer = null;
let autoplayArmed = false;
let isAutoAdvancing = false;
let isSeeking = false;
let recentTracks = [];
let queueRows = [];
let currentUserId = localStorage.getItem("taudio:userId") || "default";
let isDarkMode = localStorage.getItem("taudio:darkMode") !== "0";
let isPoetryMode = localStorage.getItem("taudio:poetryMode") === "1";
let isFocusMode = localStorage.getItem("taudio:focusMode") !== "0";
const shownDjUpdates = new Set();

function userQuery() {
  return `userId=${encodeURIComponent(currentUserId)}`;
}

function updateClock() {
  const now = new Date();
  const timeParts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hour = timeParts.find((part) => part.type === "hour").value;
  const minute = timeParts.find((part) => part.type === "minute").value;
  const second = timeParts.find((part) => part.type === "second").value;
  const time = `${hour}:${minute}`;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "long"
  }).format(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).formatToParts(now);
  const date = `${parts.find((part) => part.type === "day").value} · ${parts
    .find((part) => part.type === "month")
    .value.toUpperCase()} · ${parts.find((part) => part.type === "year").value}`;
  clockTime.setAttribute("aria-label", `${hour}:${minute}:${second}`);
  clockTime.innerHTML = `<span>${hour}</span><b>:</b><span>${minute}</span><small>${second}</small>`;
  clockTime.classList.toggle("tick", Number(second) % 2 === 0);
  miniClock.textContent = time;
  clockDay.textContent = day;
  clockDate.textContent = date;
}

function applyModeState() {
  document.body.classList.toggle("light-mode", !isDarkMode);
  document.body.classList.toggle("poetry-mode", isPoetryMode);
  document.body.classList.toggle("focus-mode", isFocusMode);
  darkModeButton.classList.toggle("active", isDarkMode);
  lightModeButton.classList.toggle("active", !isDarkMode);
  poetryModeButton.classList.toggle("active", isPoetryMode);
  focusModeButton.classList.toggle("active", isFocusMode);
  darkModeButton.setAttribute("aria-pressed", String(isDarkMode));
  lightModeButton.setAttribute("aria-pressed", String(!isDarkMode));
  poetryModeButton.setAttribute("aria-pressed", String(isPoetryMode));
  focusModeButton.setAttribute("aria-pressed", String(isFocusMode));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function setProgressDisabled(disabled) {
  progress.disabled = disabled;
  progress.classList.toggle("disabled", disabled);
}

function resetProgress() {
  progress.value = "0";
  progress.style.setProperty("--progress", "0%");
  elapsedTime.textContent = "0:00";
  durationTime.textContent = "0:00";
}

function updateProgress() {
  if (isSeeking || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const ratio = audio.currentTime / audio.duration;
  progress.value = String(Math.round(ratio * 1000));
  progress.style.setProperty("--progress", `${Math.max(0, Math.min(100, ratio * 100))}%`);
  elapsedTime.textContent = formatTime(audio.currentTime);
  durationTime.textContent = formatTime(audio.duration);
}

function addMessage(role, text) {
  const last = messages.lastElementChild;
  if (last?.classList.contains(role) && last.textContent === text) return;
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = text;
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

function speakConversation(text) {
  if (!("speechSynthesis" in window) || !text) return;
  const selectedVolume = Number(volume.value);
  const wasPlaying = !audio.paused;
  if (document.querySelector("#ducking").checked && wasPlaying) {
    audio.volume = Math.max(0.08, selectedVolume * 0.22);
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.96;
  utterance.pitch = 0.94;
  utterance.volume = selectedVolume;
  const restore = () => {
    audio.volume = selectedVolume;
  };
  utterance.onend = restore;
  utterance.onerror = restore;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function applyConversation(payload, options = {}) {
  if (payload.userId && payload.userId !== currentUserId) return;
  if (shownDjUpdates.has(payload.updatedAt)) return;
  djLine.textContent = payload.voice?.text || "我在。";
  addMessage("dj", payload.voice?.text || "我在。");
  shownDjUpdates.add(payload.updatedAt);
  if (options.speak) speakConversation(payload.voice?.text);
}

function musicSegments() {
  return sequence
    .map((segment, index) => ({ ...segment, sequenceIndex: index }))
    .filter((segment) => segment.kind === "music");
}

function queueKey(track) {
  return `${track.id || track.track_id || ""}::${track.title || ""}::${track.artist || ""}`.toLowerCase();
}

function renderQueue() {
  const seen = new Set();
  const rows = [];
  for (const track of recentTracks) {
    const key = queueKey(track);
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    rows.push(track);
  }
  queueRows = rows;

  queueCount.textContent = `${rows.length} TRACK${rows.length === 1 ? "" : "S"}`;
  queueList.replaceChildren(
    ...rows.map((track, index) => {
      const item = document.createElement("li");
      const isCurrent = nowState?.track && queueKey(nowState.track) === queueKey(track);
      if (isCurrent) item.classList.add("current");
      item.innerHTML = `<button type="button" data-queue-index="${index}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong></strong><em></em></div></button>`;
      item.querySelector("strong").textContent = track.title || "Untitled";
      item.querySelector("em").textContent = track.artist || "Unknown Artist";
      return item;
    })
  );
}

function updateNow(payload, options = {}) {
  if (payload.userId && payload.userId !== currentUserId) return;
  if (nowState?.updatedAt === payload.updatedAt && nowState?.track?.id === payload.track?.id) return;
  const shouldAutoplay = Boolean(options.autoplay || autoplayArmed);
  nowState = payload;
  sequence = payload.sequence || [];
  sequenceIndex = 0;
  djLine.textContent = payload.voice?.text || payload.infra?.trackInsight || "Taudio 已就绪。";
  trackTitle.textContent = payload.track?.title || "准备中";
  trackArtist.textContent = payload.track?.artist || "AI DJ";
  currentMood.textContent = payload.track?.mood || "-";
  renderQueue();
  const visibleMessage = payload.error || payload.voice?.text || "";
  if (visibleMessage && !shownDjUpdates.has(payload.updatedAt)) {
    addMessage("dj", visibleMessage);
    shownDjUpdates.add(payload.updatedAt);
  }
  if (sequence[0]) loadSegment(0, shouldAutoplay);
}

function loadSegment(index, autoplay = true) {
  const segment = sequence[index];
  if (!segment) return;
  sequenceIndex = index;
  if (segment.kind === "music") {
    trackTitle.textContent = segment.title;
    trackArtist.textContent = segment.artist;
  } else if (nowState?.track) {
    trackTitle.textContent = nowState.track.title;
    trackArtist.textContent = nowState.track.artist;
  }
  if (segment.text) djLine.textContent = segment.text;
  renderQueue();
  if (segment.kind === "voice" && !segment.url) {
    audio.removeAttribute("src");
    resetProgress();
    setProgressDisabled(true);
    if (autoplay) speakSegment(segment);
    return;
  }
  audio.src = segment.url;
  setProgressDisabled(false);
  resetProgress();
  if (autoplay) playAudioSegment();
  prefetchNext();
}

function prefetchNext() {
  if (!document.querySelector("#prefetch").checked) return;
  const next = sequence[sequenceIndex + 1];
  if (!next?.url) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = next.url;
  document.head.append(link);
}

function playAudioSegment() {
  audio.play().then(() => {
    playPause.textContent = "Ⅱ";
  }).catch(() => {});
}

function speakSegment(segment) {
  if (!("speechSynthesis" in window) || !segment.text || segment.provider === "none") {
    loadSegment(sequenceIndex + 1);
    return;
  }
  window.speechSynthesis.cancel();
  if (speechTimer) window.clearTimeout(speechTimer);
  const utterance = new SpeechSynthesisUtterance(segment.text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  utterance.pitch = 0.92;
  utterance.volume = Number(volume.value);
  isSpeaking = true;
  playPause.textContent = "Ⅱ";
  utterance.onend = () => {
    if (speechTimer) window.clearTimeout(speechTimer);
    speechTimer = null;
    isSpeaking = false;
    if (sequenceIndex + 1 < sequence.length) loadSegment(sequenceIndex + 1);
  };
  utterance.onerror = utterance.onend;
  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => {
    if (!isSpeaking) return;
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) utterance.onend();
  }, 700);
  const maxSpeechMs = Math.max(2800, Math.min(14000, segment.text.length * 220));
  speechTimer = window.setTimeout(() => {
    if (!isSpeaking) return;
    window.speechSynthesis.cancel();
    utterance.onend();
  }, maxSpeechMs);
}

function playCurrentSegment() {
  const segment = sequence[sequenceIndex];
  if (!segment) return;
  if (segment.kind === "voice" && !segment.url) {
    speakSegment(segment);
    return;
  }
  playAudioSegment();
}

async function requestAutoNext() {
  if (isAutoAdvancing || !autoplayArmed) return;
  isAutoAdvancing = true;
  djLine.textContent = "我听着上一首的尾巴，正在接下一首。";
  try {
    const response = await fetch("/api/auto-next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: currentUserId,
        message: "上一首歌放完了，顺着刚才的氛围继续推荐下一首"
      })
    }).then((res) => res.json());
    if (response.error && !response.sequence) {
      addMessage("dj", response.error);
      return;
    }
    updateNow(response, { autoplay: true });
    await refreshTaste();
  } finally {
    isAutoAdvancing = false;
  }
}

async function requestQueueTrack(track) {
  if (!track) return;
  autoplayArmed = true;
  if (Number.isInteger(track.sequenceIndex)) {
    loadSegment(track.sequenceIndex, true);
    return;
  }
  const title = track.title || "";
  const artist = track.artist || "";
  const id = track.id || track.track_id || "";
  if (!title) return;
  djLine.textContent = artist ? `${artist} / ${title}` : title;
  const response = await fetch("/api/play-track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: currentUserId,
      id,
      title,
      artist
    })
  }).then((res) => res.json());
  if (response.error && !response.sequence) {
    addMessage("dj", response.error);
    return;
  }
  updateNow(response, { autoplay: true });
  await refreshTaste();
}

async function refreshUsers() {
  const data = await fetch("/api/users").then((res) => res.json());
  userSelect.replaceChildren(
    ...data.users.map((user) => {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.name;
      return option;
    })
  );
  if (!data.users.some((user) => user.id === currentUserId)) currentUserId = data.users[0]?.id || "default";
  userSelect.value = currentUserId;
}

async function refreshProfile() {
  const data = await fetch(`/api/user-profile?${userQuery()}`).then((res) => res.json());
  profileEditor.value = data.profile || "";
  profileStatus.textContent = `${data.user.name} 的画像`;
}

async function refreshTaste() {
  const taste = await fetch(`/api/taste?${userQuery()}`).then((res) => res.json());
  recentTracks = taste.recent || [];
  playCount.textContent = recentTracks.length;
  tasteList.replaceChildren(
    ...taste.catalog.map((track) => {
      const li = document.createElement("li");
      li.textContent = `${track.title} · ${track.mood} · ${track.bpm} BPM`;
      return li;
    })
  );
  renderQueue();
}

async function refreshPlan() {
  const plan = await fetch("/api/plan/today").then((res) => res.json());
  planList.replaceChildren(
    ...plan.blocks.map((block) => {
      const row = document.createElement("div");
      row.className = "plan-row";
      row.innerHTML = `<strong>${block.time}</strong><span>${block.label}</span>`;
      return row;
    })
  );
}

async function refreshProviders() {
  const providers = await fetch("/api/providers").then((res) => res.json());
  providerStatus.replaceChildren(
    ...Object.entries(providers).map(([name, status]) => {
      const row = document.createElement("div");
      row.className = "provider-row";
      const label = [
        status.provider || status.command,
        status.level,
        status.authenticated === true ? "member" : status.authenticated === false ? "guest" : ""
      ].filter(Boolean).join(" · ");
      row.innerHTML = `<strong>${name}</strong><span>${label}</span>`;
      return row;
    })
  );
}

async function refreshNow() {
  const now = await fetch(`/api/now?${userQuery()}`).then((res) => res.json());
  updateNow(now);
}

async function init() {
  applyModeState();
  updateClock();
  window.setInterval(updateClock, 1000);
  await refreshUsers();
  await Promise.all([refreshProfile(), refreshNow(), refreshTaste(), refreshPlan(), refreshProviders()]);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

playPause.addEventListener("click", () => {
  autoplayArmed = true;
  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    playPause.textContent = "▶";
    return;
  }
  if (audio.paused && !isSpeaking) {
    playCurrentSegment();
  } else {
    audio.pause();
    playPause.textContent = "▶";
  }
});

nextButton.addEventListener("click", () => {
  autoplayArmed = true;
  loadSegment((sequenceIndex + 1) % Math.max(sequence.length, 1));
});

listButton.addEventListener("click", () => {
  const isOpen = queueDrawer.hidden;
  queueDrawer.hidden = !isOpen;
  listButton.classList.toggle("active", isOpen);
  listButton.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) renderQueue();
});

queueList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-queue-index]");
  if (!button) return;
  const track = queueRows[Number(button.dataset.queueIndex)];
  requestQueueTrack(track);
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
});

progress.addEventListener("input", () => {
  isSeeking = true;
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    const nextTime = (Number(progress.value) / 1000) * audio.duration;
    progress.style.setProperty("--progress", `${Number(progress.value) / 10}%`);
    elapsedTime.textContent = formatTime(nextTime);
  }
});

progress.addEventListener("change", () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  }
  isSeeking = false;
  updateProgress();
});

audio.addEventListener("ended", () => {
  const nextIndex = sequenceIndex + 1;
  if (nextIndex < sequence.length) {
    loadSegment(nextIndex);
  } else {
    requestAutoNext();
  }
});
audio.addEventListener("loadedmetadata", updateProgress);
audio.addEventListener("timeupdate", updateProgress);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  messageInput.value = "";
  addMessage("user", message);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, userId: currentUserId })
  }).then((res) => res.json());
  if (response.error && !response.sequence) {
    addMessage("dj", response.error);
    return;
  }
  if (response.conversation) {
    applyConversation(response, { speak: true });
    return;
  }
  autoplayArmed = true;
  djLine.textContent = "稍等，我来接歌。";
  updateNow(response, { autoplay: true });
  await refreshTaste();
});

userSelect.addEventListener("change", async () => {
  currentUserId = userSelect.value;
  localStorage.setItem("taudio:userId", currentUserId);
  messages.replaceChildren();
  shownDjUpdates.clear();
  audio.pause();
  window.speechSynthesis?.cancel();
  resetProgress();
  await Promise.all([refreshProfile(), refreshNow(), refreshTaste()]);
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = newUserName.value.trim();
  if (!name) return;
  const data = await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name })
  }).then((res) => res.json());
  currentUserId = data.user.id;
  localStorage.setItem("taudio:userId", currentUserId);
  newUserName.value = "";
  await refreshUsers();
  await Promise.all([refreshProfile(), refreshNow(), refreshTaste()]);
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileStatus.textContent = "保存中...";
  const data = await fetch("/api/user-profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: currentUserId, profile: profileEditor.value })
  }).then((res) => res.json());
  profileEditor.value = data.profile;
  profileStatus.textContent = "已保存";
  window.setTimeout(() => {
    profileStatus.textContent = `${data.user.name} 的画像`;
  }, 1400);
});

darkModeButton.addEventListener("click", () => {
  isDarkMode = true;
  localStorage.setItem("taudio:darkMode", "1");
  applyModeState();
});

lightModeButton.addEventListener("click", () => {
  isDarkMode = false;
  localStorage.setItem("taudio:darkMode", "0");
  applyModeState();
});

poetryModeButton.addEventListener("click", () => {
  isPoetryMode = !isPoetryMode;
  localStorage.setItem("taudio:poetryMode", isPoetryMode ? "1" : "0");
  applyModeState();
  document.querySelector(".poem-card").scrollIntoView({ behavior: "smooth", block: "center" });
});

focusModeButton.addEventListener("click", async () => {
  isFocusMode = !isFocusMode;
  localStorage.setItem("taudio:focusMode", isFocusMode ? "1" : "0");
  applyModeState();
  if (isFocusMode) {
    autoplayArmed = true;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "进入专注模式，放一首适合工作学习的歌", userId: currentUserId })
    }).then((res) => res.json());
    updateNow(response, { autoplay: true });
  }
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("active");
  });
}

const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/stream`);
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "now-playing") updateNow(message.payload, { autoplay: autoplayArmed });
  if (message.type === "conversation") applyConversation(message.payload, { speak: true });
});

init();
