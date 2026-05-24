import { spawn } from "node:child_process";
import { getConfig } from "./config.js";

function fallbackDecision(input, context) {
  const hour = new Date().getHours();
  const wantsFocus = input.includes("专注") || input.toLowerCase().includes("focus");
  const wantsEvening = input.includes("晚上") || input.includes("今晚") || input.includes("夜") || input.includes("放松") || input.includes("睡前");
  const play = wantsFocus ? "focus" : wantsEvening ? "evening" : hour < 11 ? "morning" : "night";
  const weather = context.fragments.environment.weather.summary;
  return {
    say: wantsFocus
      ? "进入专注段落，少说话，多留白。"
      : wantsEvening
        ? "好，切到柔和一点的夜间段落。"
      : `收到。${weather.includes("雨") ? "窗外适合慢一点。" : "我来接一段顺耳的。"}`,
    play,
    reason: "Local fallback selected a mood from input, time, and available context.",
    segue: wantsFocus ? "short voice, quick ducking, then low-tempo entry" : "warm voice into a clean fade"
  };
}

function normalizeDecision(value, input, context) {
  const base = typeof value === "object" && value ? value : fallbackDecision(input, context);
  return {
    say: String(base.say || "我来接一首适合现在的歌。").slice(0, 160),
    play: String(base.play || base["play()"] || "night"),
    reason: String(base.reason || "No reason supplied."),
    segue: String(base.segue || "soft crossfade")
  };
}

export async function askClaude(input, context) {
  const config = getConfig();
  if (!config.claude.enabled) {
    return fallbackDecision(input, context);
  }

  return await new Promise((resolve) => {
    const child = spawn(config.claude.command, ["-p", "--output", "json"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), config.claude.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(normalizeDecision(JSON.parse(stdout), input, context));
      } catch {
        const decision = fallbackDecision(input, context);
        decision.reason += ` Claude fallback: ${stderr.slice(0, 160)}`;
        resolve(decision);
      }
    });
    child.stdin.end(context.prompt);
  });
}
