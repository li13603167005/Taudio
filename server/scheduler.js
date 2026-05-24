import { latestPlan, savePlan } from "./state.js";

export function buildTodayPlan(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const existing = latestPlan(day);
  if (existing) return existing;

  const plan = {
    day,
    title: "Taudio private radio route",
    blocks: [
      { time: "07:00", type: "planning", label: "晨间天气与轻音乐启动" },
      { time: "09:00", type: "briefing", label: "早间摘要与专注段落" },
      { time: "12:30", type: "reset", label: "午间舒缓切换" },
      { time: "18:30", type: "commute", label: "傍晚城市段落" },
      { time: "22:30", type: "wind-down", label: "夜间低声收束" }
    ]
  };
  savePlan(day, plan);
  return plan;
}

export function startScheduler({ broadcast }) {
  const interval = setInterval(() => {
    broadcast({
      type: "heartbeat",
      at: new Date().toISOString(),
      message: "Taudio scheduler online"
    });
  }, 60_000);
  return () => clearInterval(interval);
}
