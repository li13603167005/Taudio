import fs from "node:fs/promises";
import path from "node:path";

const defaultProfile = `# 听歌习惯和偏好

- 喜欢的语言：
- 喜欢的歌手：
- 常听风格：
- 不喜欢或尽量少放：
- 早晨适合：
- 工作/学习适合：
- 晚上适合：
- 特殊说明：
`;

function slugify(input) {
  const base = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ascii = base.replace(/[^\w-]/g, "");
  return ascii || `user-${Date.now()}`;
}

function usersDir(rootDir) {
  return path.join(rootDir, "user", "profiles");
}

function usersIndexPath(rootDir) {
  return path.join(rootDir, "user", "users.json");
}

function profilePath(rootDir, userId) {
  return path.join(usersDir(rootDir), `${slugify(userId)}.md`);
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeUsers(rootDir, users) {
  await fs.mkdir(path.dirname(usersIndexPath(rootDir)), { recursive: true });
  await fs.writeFile(usersIndexPath(rootDir), JSON.stringify({ users }, null, 2), "utf8");
}

async function ensureDefaultUser(rootDir) {
  await fs.mkdir(usersDir(rootDir), { recursive: true });
  const data = await readJsonIfExists(usersIndexPath(rootDir), null);
  if (data?.users?.length) return data.users;

  const legacyTastePath = path.join(rootDir, "user", "taste.md");
  let legacyTaste = "";
  try {
    legacyTaste = await fs.readFile(legacyTastePath, "utf8");
  } catch {
    legacyTaste = defaultProfile;
  }

  const users = [{ id: "default", name: "默认用户" }];
  await fs.writeFile(profilePath(rootDir, "default"), legacyTaste || defaultProfile, "utf8");
  await writeUsers(rootDir, users);
  return users;
}

export function normalizeUserId(userId) {
  return slugify(userId || "default");
}

export async function listUsers(rootDir) {
  return ensureDefaultUser(rootDir);
}

export async function createUser(rootDir, name) {
  const users = await ensureDefaultUser(rootDir);
  const displayName = String(name || "").trim();
  if (!displayName) throw new Error("name is required");
  let id = slugify(displayName);
  let suffix = 2;
  const existing = new Set(users.map((user) => user.id));
  while (existing.has(id)) {
    id = `${slugify(displayName)}-${suffix}`;
    suffix += 1;
  }
  const user = { id, name: displayName };
  users.push(user);
  await fs.writeFile(profilePath(rootDir, id), defaultProfile, "utf8");
  await writeUsers(rootDir, users);
  return user;
}

export async function getUserProfile(rootDir, userId = "default") {
  const id = normalizeUserId(userId);
  const users = await ensureDefaultUser(rootDir);
  const user = users.find((item) => item.id === id) || users[0];
  try {
    const profile = await fs.readFile(profilePath(rootDir, user.id), "utf8");
    return { user, profile };
  } catch {
    await fs.writeFile(profilePath(rootDir, user.id), defaultProfile, "utf8");
    return { user, profile: defaultProfile };
  }
}

export async function saveUserProfile(rootDir, userId, profile) {
  const id = normalizeUserId(userId);
  const users = await ensureDefaultUser(rootDir);
  const user = users.find((item) => item.id === id);
  if (!user) throw new Error("user not found");
  const content = String(profile || "").trimEnd() + "\n";
  await fs.writeFile(profilePath(rootDir, user.id), content, "utf8");
  return { user, profile: content };
}
