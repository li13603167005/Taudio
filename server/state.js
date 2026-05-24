import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let db;

export function initState(rootDir) {
  const dbPath = path.join(rootDir, "server", "state.db");
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try {
    db.exec("ALTER TABLE messages ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'");
  } catch {}
  try {
    db.exec("ALTER TABLE plays ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'");
  } catch {}
  return db;
}

export function addMessage(role, content, userId = "default") {
  db.prepare("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)").run(userId, role, content);
}

export function addPlay(track, source = "radio", userId = "default") {
  db.prepare("INSERT INTO plays (user_id, track_id, title, artist, source) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    track.id,
    track.title,
    track.artist,
    source
  );
}

export function recentMessages(limit = 8, userId = "default") {
  return db
    .prepare("SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit)
    .reverse();
}

export function recentPlays(limit = 8, userId = "default") {
  return db
    .prepare("SELECT track_id, title, artist, source, created_at FROM plays WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit);
}

export function recentPlaysWithinHours(hours = 24, limit = 100, userId = "default") {
  const safeHours = Math.max(1, Math.floor(Number(hours) || 24));
  return db
    .prepare(
      "SELECT track_id, title, artist, source, created_at FROM plays WHERE user_id = ? AND created_at >= datetime('now', ?) ORDER BY id DESC LIMIT ?"
    )
    .all(userId, `-${safeHours} hours`, limit);
}

export function savePlan(day, payload) {
  db.prepare("INSERT INTO plan (day, payload) VALUES (?, ?)").run(day, JSON.stringify(payload));
}

export function latestPlan(day) {
  const row = db
    .prepare("SELECT payload FROM plan WHERE day = ? ORDER BY id DESC LIMIT 1")
    .get(day);
  return row ? JSON.parse(row.payload) : null;
}

export function allPrefs() {
  return db.prepare("SELECT key, value, updated_at FROM prefs ORDER BY key").all();
}
