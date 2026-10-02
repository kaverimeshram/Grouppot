import { copy } from "@/lib/copy";
import type { Status } from "@/lib/circle-state";
import { hueOf, initialOf } from "./ring-util";

const wash: Record<Status, string> = {
  open: "bg-surface",
  paid: "bg-surface-pale",
  notyet: "bg-surface",
  covered: "bg-warning-pale",
  stopped: "bg-negative-pale",
  collected: "bg-surface-pale",
};
const word: Record<Status, string> = {
  open: "text-caption",
  paid: "text-positive-deep",
  notyet: "text-ink",
  covered: "text-warning-ink",
  stopped: "text-negative-deep",
  collected: "text-positive-deep",
};

export function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill font-semibold"
      style={dim ? { background: "var(--color-surface)", color: "var(--color-mute)" } : { background: `hsl(${hue} 40% 88%)`, color: `hsl(${hue} 50% 22%)` }}
    >
      {initialOf(name)}
    </span>
  );
}

export function MemberRow({ name, you, status, caption, record }: { name: string; you: boolean; status: Status; caption: string; record?: string }) {
  return (
    <li className={`row-flip flex min-h-16 items-center gap-3 rounded-card px-4 py-2 ${wash[status]}`}>
      <Avatar name={name} dim={status === "open"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {name}
          {you ? <span className="t-small font-normal text-caption">{` (${copy.circle.youTag})`}</span> : null}
        </span>
        <span className="t-caption block truncate text-caption">{caption}</span>
        {record ? <span className="t-caption block text-caption">{record}</span> : null}
      </span>
      <span className={`t-small flex items-center gap-2 font-semibold ${word[status]}`}>
        {status === "paid" || status === "collected" ? (
          <span className="check-in flex h-5 w-5 items-center justify-center rounded-pill bg-primary" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-5 w-5">
              <path d="M5.5 10.5l3 3 6-6.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-deep" />
            </svg>
          </span>
        ) : null}
        {copy.status[status]}
      </span>
    </li>
  );
}
