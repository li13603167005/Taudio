import fs from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = new URL("../.env", import.meta.url);
const qrHtmlPath = new URL("../cache/netease-login.html", import.meta.url);
const publicQrHtmlPath = new URL("../public/netease-login.html", import.meta.url);
const cookieAttributeNames = new Set(["domain", "path", "expires", "max-age", "samesite", "secure", "httponly"]);

function readEnvValue(key) {
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim() : "";
}

const baseUrl = process.env.NETEASE_API_BASE || readEnvValue("NETEASE_API_BASE") || "http://127.0.0.1:3000";

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function upsertEnv(key, value) {
  const filePath = envPath;
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const line = `${key}=${value}`;
  if (current.match(new RegExp(`^${key}=.*$`, "m"))) {
    fs.writeFileSync(filePath, current.replace(new RegExp(`^${key}=.*$`, "m"), line));
  } else {
    fs.writeFileSync(filePath, `${current.trimEnd()}\n${line}\n`);
  }
}

function normalizeCookie(rawCookie) {
  const pairs = new Map();
  for (const part of rawCookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    const name = index === -1 ? trimmed : trimmed.slice(0, index).trim();
    if (!name || cookieAttributeNames.has(name.toLowerCase())) continue;
    const value = index === -1 ? "" : trimmed.slice(index + 1).trim();
    pairs.set(name, value);
  }
  if (!pairs.has("os")) pairs.set("os", "pc");
  return Array.from(pairs, ([name, value]) => (value ? `${name}=${value}` : name)).join("; ");
}

const keyResult = await getJson(`/login/qr/key?timestamp=${Date.now()}`);
const key = keyResult.data?.unikey;
if (!key) throw new Error("Could not get Netease QR login key");

const qr = await getJson(
  `/login/qr/create?key=${encodeURIComponent(key)}&platform=web&qrimg=true&timestamp=${Date.now()}`
);
const qrimg = qr.data?.qrimg;
const qrurl = qr.data?.qrurl;
if (!qrimg && !qrurl) throw new Error("Could not create Netease QR image");

fs.mkdirSync(new URL("../cache/", import.meta.url), { recursive: true });
fs.mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
const loginHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Taudio NetEase Login</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101417; color: #f7f2e8; font-family: system-ui, sans-serif; }
    main { text-align: center; max-width: 420px; padding: 32px; }
    img { width: 260px; height: 260px; background: #fff; padding: 12px; border-radius: 8px; }
    p { line-height: 1.7; color: #d8d2c6; }
  </style>
</head>
<body>
  <main>
    <h1>网易云会员登录</h1>
    ${qrimg ? `<img src="${qrimg}" alt="网易云登录二维码" />` : `<p>${qrurl}</p>`}
    <p>用网易云音乐 App 扫码并确认登录。这个窗口只用于生成 Taudio 的本地 Cookie，不会上传你的账号信息。</p>
  </main>
</body>
</html>
`;
fs.writeFileSync(qrHtmlPath, loginHtml, "utf8");
fs.writeFileSync(publicQrHtmlPath, loginHtml, "utf8");

console.log("\nOpen this local QR page, then scan it with the Netease Cloud Music app:\n");
console.log(fileURLToPath(qrHtmlPath));
console.log("http://127.0.0.1:8080/netease-login.html");
console.log("\nPolling login status for 5 minutes...\n");

for (let attempt = 0; attempt < 150; attempt += 1) {
  const check = await getJson(`/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}&noCookie=true`);
  if (check.code === 803 && check.cookie) {
    upsertEnv("NETEASE_COOKIE", normalizeCookie(check.cookie));
    console.log("\nLogin succeeded. NETEASE_COOKIE was written to .env.");
    console.log("Restart Taudio after this.");
    process.exit(0);
  }
  if (check.code === 800) throw new Error("QR code expired. Run the script again.");
  console.log(`Waiting for confirmation... code=${check.code}, message=${check.message || ""}`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

throw new Error("Timed out waiting for QR login confirmation");
