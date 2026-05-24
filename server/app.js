import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfig, loadEnv } from "./config.js";
import { initState } from "./state.js";
import { createRadioRouter } from "./router.js";
import { startScheduler } from "./scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
loadEnv(rootDir);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function resolveStaticPath(urlPath) {
  if (urlPath.startsWith("/tts/")) {
    return path.join(rootDir, "cache", "tts", decodeURIComponent(urlPath.slice(5)));
  }
  if (urlPath.startsWith("/audio/")) {
    return path.join(rootDir, "cache", "music", decodeURIComponent(urlPath.slice(7)));
  }
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  return path.join(rootDir, "public", decodeURIComponent(clean));
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  const filePath = resolveStaticPath(requestUrl.pathname);
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[ext] ?? "application/octet-stream",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(res);
}

function encodeWebSocketFrame(data) {
  const payload = Buffer.from(JSON.stringify(data));
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

export async function createTaudioServer(options = {}) {
  initState(rootDir);
  const clients = new Set();
  const broadcast = (message) => {
    for (const socket of clients) {
      if (socket.destroyed) {
        clients.delete(socket);
        continue;
      }
      try {
        socket.write(encodeWebSocketFrame(message));
      } catch {
        clients.delete(socket);
        socket.destroy();
      }
    }
  };
  const radio = createRadioRouter({ rootDir, broadcast });
  const stopScheduler = startScheduler({ broadcast });

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      if (req.method === "POST" && requestUrl.pathname === "/api/chat") {
        return sendJson(res, 200, await radio.handleChat(await readJson(req)));
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/auto-next") {
        return sendJson(res, 200, await radio.handleAutoNext(await readJson(req)));
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/play-track") {
        return sendJson(res, 200, await radio.handlePlayTrack(await readJson(req)));
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/now") {
        const userId = requestUrl.searchParams.get("userId") || "default";
        await radio.bootstrap(userId);
        return sendJson(res, 200, radio.now(userId));
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/next") {
        return sendJson(res, 200, radio.next(requestUrl.searchParams.get("userId") || "default"));
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/taste") {
        return sendJson(res, 200, radio.taste(requestUrl.searchParams.get("userId") || "default"));
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/users") {
        return sendJson(res, 200, { users: await radio.users() });
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/users") {
        const body = await readJson(req);
        const { createUser } = await import("./users.js");
        return sendJson(res, 200, { user: await createUser(rootDir, body.name) });
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/user-profile") {
        return sendJson(res, 200, await radio.userProfile(requestUrl.searchParams.get("userId") || "default"));
      }
      if (req.method === "PUT" && requestUrl.pathname === "/api/user-profile") {
        const body = await readJson(req);
        return sendJson(res, 200, await radio.saveUserProfile(body.userId, body.profile));
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/plan/today") {
        return sendJson(res, 200, radio.todayPlan());
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/providers") {
        return sendJson(res, 200, radio.providers());
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/providers/check") {
        return sendJson(res, 200, await radio.healthCheckProviders());
      }
      return serveStatic(req, res);
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  });

  server.on("upgrade", (req, socket) => {
    const requestUrl = new URL(req.url, "http://localhost");
    if (requestUrl.pathname !== "/stream") {
      socket.destroy();
      return;
    }
    const key = req.headers["sec-websocket-key"];
    const accept = crypto
      .createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        ""
      ].join("\r\n")
    );
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    try {
      socket.write(encodeWebSocketFrame({ type: "connected", payload: radio.now() }));
    } catch {
      clients.delete(socket);
      socket.destroy();
    }
  });

  const config = getConfig();
  const port = options.port ?? config.server.port;
  const host = options.host ?? config.server.host;
  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    server,
    radio,
    url: `http://${host}:${address.port}`,
    close: async () => {
      stopScheduler();
      for (const socket of clients) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createTaudioServer();
  console.log(`Taudio is on air at ${app.url}`);
}
