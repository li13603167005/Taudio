import fs from "node:fs/promises";
import path from "node:path";
import { getCalendarSummary } from "./adapters/calendar.js";
import { getWeatherSummary } from "./adapters/weather.js";
import { recentMessages, recentPlays, allPrefs } from "./state.js";
import { getLocalTimeContext } from "./time.js";
import { getUserProfile, normalizeUserId } from "./users.js";

async function readIfExists(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export async function buildContext(rootDir, input, execution = {}) {
  const persona = await readIfExists(path.join(rootDir, "prompts", "ai-persona.md"));
  const userId = normalizeUserId(execution.userId);
  const userDir = path.join(rootDir, "user");
  const [{ user, profile }, routines, moodRules, playlists] = await Promise.all([
    getUserProfile(rootDir, userId),
    readIfExists(path.join(userDir, "routines.md")),
    readIfExists(path.join(userDir, "mood-rules.md")),
    readIfExists(path.join(userDir, "playlists.json"), "{}")
  ]);
  const time = getLocalTimeContext();
  const [weather, calendar] = await Promise.all([getWeatherSummary(), getCalendarSummary()]);
  const environment = {
    weather,
    calendar,
    time,
    now: time.label
  };
  const fragments = {
    system: persona,
    user: { id: user.id, name: user.name, profile, routines, moodRules, playlists: JSON.parse(playlists) },
    environment,
    memory: { messages: recentMessages(8, user.id), plays: recentPlays(8, user.id), prefs: allPrefs() },
    input: { text: input, toolResults: execution.toolResults ?? null },
    execution: { source: execution.source ?? "chat", task: execution.task ?? null, userId: user.id }
  };

  const prompt = [
    "# CONTEXT WINDOW",
    "Return strict JSON: {\"say\":\"...\",\"play\":\"...\",\"reason\":\"...\",\"segue\":\"...\"}",
    `Important local time: ${fragments.environment.time.label}. Use this as the user's actual current time. Do not infer time from UTC.`,
    `## System\n${fragments.system}`,
    `## Current listener\n${fragments.user.name} (${fragments.user.id})`,
    `## Listener music profile\n${fragments.user.profile}\n${fragments.user.routines}\n${fragments.user.moodRules}`,
    `## Environment\n${JSON.stringify(fragments.environment, null, 2)}`,
    `## Memory\n${JSON.stringify(fragments.memory, null, 2)}`,
    `## Input\n${input}`,
    `## Execution\n${JSON.stringify(fragments.execution, null, 2)}`
  ].join("\n\n");

  return { fragments, prompt };
}
