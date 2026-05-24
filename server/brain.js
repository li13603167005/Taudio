import { spawn } from "node:child_process";
import { getConfig } from "./config.js";
import { askDeepSeek } from "./adapters/deepseek.js";
import { getLocalTimeContext } from "./time.js";

function fallbackDecision(input, context) {
  const hour = context.fragments.environment.time?.hour ?? getLocalTimeContext().hour;
  const lower = input.toLowerCase();
  const wantsFocus = input.includes("专注") || input.includes("工作") || input.includes("学习") || lower.includes("focus");
  const wantsEvening =
    input.includes("晚上") ||
    input.includes("今晚") ||
    input.includes("夜") ||
    input.includes("放松") ||
    input.includes("睡前") ||
    lower.includes("evening") ||
    lower.includes("night");
  const wantsEnglish = lower.includes("english") || input.includes("英文");
  const play = wantsFocus
    ? "NEFFEX focus"
    : wantsEvening
      ? wantsEnglish
        ? "Men I Trust night"
        : "Gareth.T R&B"
      : hour < 11
        ? "HYBS morning"
        : wantsEnglish
          ? "HONNE warm R&B"
          : "Gareth.T R&B";
  return {
    say: wantsFocus
      ? "少说话，多留白。"
      : wantsEvening
        ? "切到柔和一点的质感。"
        : "我在。",
    play,
    reason: "Local fallback selected a concrete seed query from input, time, and recent-play constraints.",
    segue: wantsFocus ? "short voice, then clean entry" : "warm voice into a short fade"
  };
}

function normalizeDecision(value, input, context) {
  const base = typeof value === "object" && value ? value : fallbackDecision(input, context);
  return {
    say: String(base.say || "我在。").slice(0, 180),
    play: String(base.play || base["play()"] || "Gareth.T R&B").slice(0, 100),
    reason: String(base.reason || "No reason supplied.").slice(0, 500),
    segue: String(base.segue || "soft crossfade").slice(0, 240)
  };
}

async function askClaudeCli(input, context) {
  const config = getConfig();
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

export async function askBrain(input, context) {
  const config = getConfig();
  if (config.brain.provider === "deepseek") {
    try {
      return normalizeDecision(await askDeepSeek(input, context), input, context);
    } catch (error) {
      const decision = fallbackDecision(input, context);
      decision.reason += ` DeepSeek fallback: ${error.message}`;
      return decision;
    }
  }
  if (config.brain.provider === "claude-cli") {
    return askClaudeCli(input, context);
  }
  return fallbackDecision(input, context);
}
