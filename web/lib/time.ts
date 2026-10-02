import { copy } from "./copy";

const clock = (d: Date) =>
  d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" AM", "am")
    .replace(" PM", "pm");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/// "in 6 min", "today 6pm", "tomorrow 6pm", "Saturday 6pm", "Sat 17 Oct". Local time, `now` and `ts` in unix seconds.
export function formatWhen(ts: number, now: number): string {
  const diff = ts - now;
  if (diff <= 0) return copy.time.now;
  if (diff < 60) return copy.time.underMinute;
  if (diff < 90 * 60) return copy.time.inMinutes(Math.round(diff / 60));
  const d = new Date(ts * 1000);
  const days = Math.round((startOfDay(d) - startOfDay(new Date(now * 1000))) / 86_400_000);
  if (days === 0) return copy.time.today(clock(d));
  if (days === 1) return copy.time.tomorrow(clock(d));
  if (days < 7) return `${d.toLocaleDateString("en-US", { weekday: "long" })} ${clock(d)}`;
  return formatDay(ts);
}

/// A date only, for "started on Sat 3 Oct" and "collects on Sat 17 Oct".
export function formatDay(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

/// Over a day "2 days 4 hours", under a day "5h 12m", under an hour "42m 10s".
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 86_400) {
    const d = Math.floor(s / 86_400);
    const h = Math.floor((s % 86_400) / 3600);
    return h === 0 ? copy.time.days(d) : `${copy.time.days(d)} ${copy.time.hours(h)}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
