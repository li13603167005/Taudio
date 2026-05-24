import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeToneWav(filePath, options = {}) {
  const sampleRate = options.sampleRate ?? 24000;
  const duration = options.duration ?? 4;
  const frequency = options.frequency ?? 440;
  const secondaryFrequency = options.secondaryFrequency ?? frequency * 1.5;
  const volume = options.volume ?? 0.28;
  const samples = Math.floor(sampleRate * duration);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const fadeIn = Math.min(1, t / 0.08);
    const fadeOut = Math.min(1, (duration - t) / 0.16);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const wave =
      Math.sin(2 * Math.PI * frequency * t) * 0.72 +
      Math.sin(2 * Math.PI * secondaryFrequency * t) * 0.28;
    const sample = Math.max(-1, Math.min(1, wave * volume * envelope));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function ensureToneWav(filePath, options) {
  if (!fs.existsSync(filePath)) {
    writeToneWav(filePath, options);
  }
  return filePath;
}
