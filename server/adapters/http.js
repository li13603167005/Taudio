import http from "node:http";
import net from "node:net";
import tls from "node:tls";

export function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function withTimeout(options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    options: {
      ...options,
      signal: options.signal ?? controller.signal
    },
    clear: () => clearTimeout(timeout)
  };
}

export async function fetchJson(url, options = {}) {
  if (shouldUseProxy(url)) {
    const body = await fetchBufferViaProxy(url, options, options.timeoutMs ?? 8000);
    return JSON.parse(body.toString("utf8"));
  }
  const timed = withTimeout(options, options.timeoutMs ?? 8000);
  try {
    const response = await fetch(url, timed.options);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 180)}`);
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${options.timeoutMs ?? 8000}ms`);
    }
    throw error;
  } finally {
    timed.clear();
  }
}

export async function fetchBuffer(url, options = {}) {
  if (shouldUseProxy(url)) {
    return fetchBufferViaProxy(url, options, options.timeoutMs ?? 12000);
  }
  const timed = withTimeout(options, options.timeoutMs ?? 12000);
  try {
    const response = await fetch(url, timed.options);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 180)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${options.timeoutMs ?? 12000}ms`);
    }
    throw error;
  } finally {
    timed.clear();
  }
}

function shouldUseProxy(url) {
  const target = new URL(url);
  if (target.protocol !== "https:") return false;
  return Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY);
}

function getProxyUrl() {
  const raw = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (!raw) return null;
  const proxy = new URL(raw);
  if (proxy.protocol !== "http:") {
    throw new Error("Only http:// proxies are currently supported by Taudio");
  }
  return proxy;
}

async function createTunnel(target, proxy, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const socket = net.connect({
      host: proxy.hostname,
      port: Number(proxy.port || 80)
    });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Proxy tunnel timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("connect", () => {
      const auth = proxy.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}\r\n`
        : "";
      socket.write(
        `CONNECT ${target.hostname}:443 HTTP/1.1\r\n` +
          `Host: ${target.hostname}:443\r\n` +
          auth +
          "Connection: close\r\n\r\n"
      );
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once("data", (chunk) => {
      const head = chunk.toString("latin1");
      if (!head.includes(" 200 ")) {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(`Proxy tunnel failed: ${head.split("\r\n")[0]}`));
        return;
      }
      const tlsSocket = tls.connect({
        socket,
        servername: target.hostname
      });
      tlsSocket.once("secureConnect", () => {
        clearTimeout(timeout);
        resolve(tlsSocket);
      });
      tlsSocket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });
}

async function fetchBufferViaProxy(url, options = {}, timeoutMs) {
  const target = new URL(url);
  const proxy = getProxyUrl();
  const socket = await createTunnel(target, proxy, timeoutMs);

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const request = httpsRequestOverSocket(target, socket, options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        clearTimeout(timeout);
        const body = Buffer.concat(chunks);
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body.toString("utf8").slice(0, 180)}`));
          return;
        }
        resolve(body);
      });
    });
    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    if (options.body) request.write(options.body);
    request.end();
  });
}

function httpsRequestOverSocket(target, socket, options, callback) {
  const headers = {
    host: target.host,
    ...(options.headers || {})
  };
  if (options.body && !headers["content-length"] && !headers["Content-Length"]) {
    headers["content-length"] = Buffer.byteLength(options.body);
  }
  return http.request(
    {
      createConnection: () => socket,
      method: options.method || "GET",
      path: `${target.pathname}${target.search}`,
      headers,
      setHost: false
    },
    callback
  );
}
