const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function getLocalTimeContext(
  date = new Date(),
  timeZone = process.env.TAUDIO_TIMEZONE || process.env.CLAUDIO_TIMEZONE || DEFAULT_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const period =
    hour < 5
      ? "late-night"
      : hour < 9
        ? "morning"
        : hour < 12
          ? "forenoon"
          : hour < 14
            ? "noon"
            : hour < 18
              ? "afternoon"
              : hour < 22
                ? "evening"
                : "night";
  return {
    timeZone,
    isoUtc: date.toISOString(),
    localDate: `${values.year}-${values.month}-${values.day}`,
    localTime: `${values.hour}:${values.minute}:${values.second}`,
    weekday: values.weekday,
    hour,
    period,
    label: `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${timeZone}`
  };
}
