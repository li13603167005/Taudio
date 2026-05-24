import { getConfig } from "../config.js";
import { fetchJson } from "./http.js";

async function getFeishuToken(appId, appSecret) {
  const data = await fetchJson("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  if (!data.app_access_token) {
    throw new Error(data.msg || "Feishu token response did not include app_access_token");
  }
  return data.app_access_token;
}

export async function getCalendarSummary() {
  const { feishu, fallback } = getConfig();
  if (!feishu.appId || !feishu.appSecret) {
    return {
      source: "local-default",
      next: fallback.nextEvent
    };
  }

  try {
    const token = await getFeishuToken(feishu.appId, feishu.appSecret);
    const now = Math.floor(Date.now() / 1000);
    const end = now + 24 * 60 * 60;
    const url = new URL(
      `https://open.feishu.cn/open-apis/calendar/v4/calendars/${encodeURIComponent(feishu.calendarId)}/events`
    );
    url.searchParams.set("start_time", String(now));
    url.searchParams.set("end_time", String(end));
    url.searchParams.set("page_size", "10");

    const data = await fetchJson(url, {
      headers: { authorization: `Bearer ${token}` }
    });
    const events = data.data?.items ?? [];
    const nextEvent = events[0];
    return {
      source: "feishu",
      next: nextEvent?.summary ? `${nextEvent.summary}` : fallback.nextEvent,
      raw: events.slice(0, 3).map((event) => ({
        summary: event.summary,
        startTime: event.start_time,
        endTime: event.end_time
      }))
    };
  } catch (error) {
    return {
      source: "feishu-fallback",
      next: fallback.nextEvent,
      error: error.message
    };
  }
}
