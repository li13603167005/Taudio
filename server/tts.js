import crypto from "node:crypto";
import { getConfig } from "./config.js";

export async function synthesizeSpeech(_rootDir, text) {
  const id = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  const provider = getConfig().tts.provider === "none" ? "none" : "browser-speech";
  return {
    id,
    text,
    url: null,
    provider
  };
}
