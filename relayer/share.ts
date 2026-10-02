// Link previews: the HTML a chat app's crawler reads for /c/?id=<circle>, and the 1200 by 630 picture of that circle's
// ring drawn from live chain state. Reads and the circle check are injected so the tests run without a network.
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { Address } from "viem";
import { dollars, type Snapshot } from "../web/lib/chain";
import { centre, isDone, isStarted, num, recipientName, sentence, statusOf, type Status } from "../web/lib/circle-state";
import { copy } from "../web/lib/copy";
import { formatDay } from "../web/lib/time";
import { SITE, words } from "./words";

export const W = 1200;
export const H = 630;
const INK = "#0e0f0c";
const LIME = "#9fe870";
const LINE = "#c4c9c0";
const MUTE = "#868685";
const WARNING = "#ffd11a";
const NEGATIVE = "#d03238";
const TRACK = "#1c1e1a";

export const isCircleId = (x: unknown): x is Address => typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x);

// ---------- the words ----------

/// The page's one sentence, with a day where the page says a clock time: a preview is read hours or days after it is made.
export function previewLine(s: Snapshot, now: number): string {
  if (isStarted(s) && !isDone(s)) {
    const who = recipientName(s);
    if (now < num(s.opensAt)) {
      const day = formatDay(num(s.opensAt));
      return s.paidCount > 0n ? words.aheadOn(num(s.paidCount), num(s.size), num(s.round) + 1, day) : words.opensOn(num(s.round) + 1, day);
    }
    if (s.paidCount < s.size) {
      return now > num(s.dueAt) ? copy.circle.sentenceTimeUp(who) : words.collectsBy(num(s.paidCount), num(s.size), who, formatDay(num(s.dueAt)));
    }
  }
  return sentence(s, now);
}

export type Preview = { title: string; description: string; image: string; url: string };

export const circleUrl = (circle: Address) => `${SITE}/c/?id=${circle}`;

export function previewFor(s: Snapshot, now: number): Preview {
  return {
    title: s.name,
    description: previewLine(s, now),
    image: `${SITE}/api/og?id=${s.address}&r=${num(s.round)}.${num(s.paidCount)}`,
    url: circleUrl(s.address),
  };
}

export const genericPreview = (): Preview => ({ title: words.genericTitle, description: words.genericDescription, image: `${SITE}/api/og`, url: SITE });

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function shareHtml(p: Preview): string {
  const alt = words.ringLabel(p.title, p.description);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(words.brand)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.url)}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(p.image)}">
<meta name="twitter:image:alt" content="${esc(alt)}">
</head><body><p><a href="${esc(p.url)}">${esc(words.openCircle)}</a></p></body></html>
`;
}

// ---------- the ring ----------

type Ring = { arcs: Status[]; labels: string[]; recipient: number | null; big: string; small: string; facts: string; mark?: boolean };

const FONT = "Manrope, sans-serif";
const CX = 330;
const CY = 315;
const R = 165;

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)] as const;
};
const f = (n: number) => n.toFixed(2);

/// Arc from `a` to `b` degrees, clockwise from 12 o'clock.
function arc(a: number, b: number): string {
  const [x0, y0] = pt(R, a);
  const [x1, y1] = pt(R, b);
  return `M${f(x0)} ${f(y0)}A${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}

/// Greedy wrap by estimated width: Manrope runs about 0.58 em a character in bold and 0.54 in medium.
export function wrap(text: string, size: number, width: number, bold: boolean, maxLines: number): string[] {
  const per = size * (bold ? 0.6 : 0.55);
  const fit = Math.max(4, Math.floor(width / per));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= fit || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, fit - 1)).trimEnd()}…`;
    return kept;
  }
  return lines.map((l) => (l.length > fit ? `${l.slice(0, fit - 1)}…` : l));
}

const text = (x: number, y: number, size: number, weight: 500 | 700, fill: string, body: string, anchor = "start") =>
  `<text x="${f(x)}" y="${f(y)}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(body)}</text>`;


const LEGEND: Partial<Record<Status, [string, string]>> = {
  paid: [LIME, copy.status.paid],
  collected: [LIME, copy.status.collected],
  notyet: [MUTE, copy.status.notyet],
  covered: [WARNING, copy.status.covered],
  stopped: [NEGATIVE, copy.status.stopped],
};

function ringSvg(ring: Ring, title: string, line: string): string {
  const n = ring.arcs.length;
  const step = 360 / n;
  // a crowded ring gets a slimmer band; each arc is pulled in by its round cap so neighbours never touch
  const thick = n > 8 ? 24 : 40;
  const inset = (thick / 2 / R) * (180 / Math.PI) + (n > 8 ? 1.5 : 3);
  const parts: string[] = [];
  ring.arcs.forEach((st, i) => {
    // the collector's arc sits centred on 12 o'clock, the rest follow clockwise in the order they collect
    const rel = ring.recipient === null ? i : (i - ring.recipient + n) % n;
    const mid = rel * step;
    const d = arc(mid - step / 2 + inset, mid + step / 2 - inset);
    const round = `fill="none" stroke-linecap="round"`;
    if (st === "paid" || st === "collected") parts.push(`<path d="${d}" ${round} stroke="${LIME}" stroke-width="${thick}"/>`);
    else if (st === "covered") parts.push(`<path d="${d}" ${round} stroke="${WARNING}" stroke-width="${thick}"/>`);
    else if (st === "open") parts.push(`<path d="${d}" ${round} stroke="${LINE}" stroke-width="9" stroke-dasharray="0.1 22"/>`);
    else {
      const edge = st === "stopped" ? NEGATIVE : MUTE;
      parts.push(`<path d="${d}" ${round} stroke="${edge}" stroke-width="${thick}"/><path d="${d}" ${round} stroke="${INK}" stroke-width="${thick - 7}"/>`);
    }
    if (n <= 8 && ring.labels[i]) {
      const [lx, ly] = pt(R + thick / 2 + 26, mid);
      const s = Math.sin((mid * Math.PI) / 180);
      const anchor = Math.abs(s) < 0.3 ? "middle" : s > 0 ? "start" : "end";
      const name = ring.labels[i]!.length > 10 ? `${ring.labels[i]!.slice(0, 9)}…` : ring.labels[i]!;
      parts.push(text(lx, ly + 8, 24, 500, st === "open" ? MUTE : LINE, name, anchor));
    }
  });
  if (ring.recipient !== null) {
    const [dx, dy] = pt(R, 0);
    parts.push(`<circle cx="${f(dx)}" cy="${f(dy)}" r="34" fill="#ffffff"/>`);
    parts.push(text(dx, dy + 11, 32, 700, INK, [...ring.labels[ring.recipient]!][0]?.toUpperCase() ?? "", "middle"));
  }
  if (ring.mark) parts.push(`<circle cx="${CX}" cy="${CY}" r="56" fill="${LIME}"/>`);
  const bigSize = ring.big.length <= 4 ? 84 : ring.big.length <= 6 ? 64 : 48;
  const baseline = CY + bigSize * 0.18 - (ring.small ? 14 : 0);
  parts.push(text(CX, baseline, bigSize, 700, "#ffffff", ring.big, "middle"));
  wrap(ring.small, 22, 250, false, 2).forEach((l, i) => parts.push(text(CX, baseline + 36 + i * 28, 22, 500, LINE, l, "middle")));

  const tx = 650;
  const tw = 500;
  const out: string[] = ring.mark ? [] : [text(tx, 96, 30, 700, LIME, words.brand)];
  let y = 200;
  for (const l of wrap(title, 54, tw, true, 2)) {
    out.push(text(tx, y, 54, 700, ring.mark ? LIME : "#ffffff", l));
    y += 62;
  }
  y += 14;
  // the sentence takes the room between the title and the facts line, and no more
  const room = Math.max(1, Math.floor((H - 132 - 34 - y) / 42) + 1);
  for (const l of wrap(line, 32, tw, false, room)) {
    out.push(text(tx, y, 32, 500, "#e8ebe6", l));
    y += 42;
  }
  if (ring.facts) out.push(text(tx, H - 132, 24, 500, LINE, ring.facts));
  // a colour is never left without its word
  let lx = tx;
  for (const st of ring.mark ? [] : new Set(ring.arcs)) {
    const key = LEGEND[st];
    if (!key) continue;
    const hollow = st === "notyet" || st === "stopped";
    out.push(`<circle cx="${lx + 9}" cy="${H - 88}" r="9" fill="${hollow ? INK : key[0]}" stroke="${key[0]}" stroke-width="3"/>`);
    out.push(text(lx + 26, H - 80, 22, 500, LINE, key[1]));
    lx += 26 + key[1].length * 12.5 + 30;
  }
  out.push(text(tx, H - 36, 24, 500, MUTE, words.site));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${INK}"/>${parts.join("")}${out.join("")}</svg>`;
}

export function circleSvg(s: Snapshot, now: number): string {
  const done = isDone(s);
  const c = centre(s, now);
  const who = recipientName(s);
  return ringSvg(
    {
      arcs: s.members.map((_, i) => statusOf(s, i)),
      labels: s.members.map((m) => m.label),
      recipient: done ? null : isStarted(s) ? num(s.round) : 0,
      big: c.big,
      // the page's centre line carries a clock time; a picture is read later, so it names only who collects
      small: done ? c.small : isStarted(s) ? copy.circle.centreTo(who) : `${copy.circle.centreTo(who)} ${copy.circle.centreWhenFull}`,
      facts: copy.circle.facts(dollars(s.contribution), copy.periods.label(num(s.period)), num(s.size)),
    },
    s.name,
    previewLine(s, now),
  );
}

/// The brand mark's ring: four paid arcs and one open place. Used when the link is not a grouppot circle.
export function genericSvg(): string {
  return ringSvg({ arcs: ["paid", "paid", "paid", "paid", "open"], labels: [], recipient: null, big: "", small: "", facts: "", mark: true }, words.brand, words.genericDescription);
}


// ---------- png ----------

const FONTS = ["Manrope-500.ttf", "Manrope-700.ttf"].map((f) => path.join(import.meta.dir, "fonts", f));
const cache = new Map<string, Uint8Array<ArrayBuffer>>();

/// A PNG per distinct picture. The key holds the circle, its round and paid count, and the picture's own digest, so a
/// circle whose words changed (a member joined, the round fell due) gets a fresh render and an unchanged one never does.
export const render = (svg: string) =>
  new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Manrope" }, fitTo: { mode: "width", value: W } }).render();

export function png(key: string, svg: string): Uint8Array<ArrayBuffer> {
  const k = `${key}:${Bun.hash(svg).toString(36)}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const out = new Uint8Array(render(svg).asPng());
  if (cache.size >= 300) cache.delete(cache.keys().next().value!);
  cache.set(k, out);
  return out;
}

export const pngFor = (s: Snapshot, now: number) => png(`${s.address.toLowerCase()}:${num(s.round)}:${num(s.paidCount)}`, circleSvg(s, now));
export const genericPng = () => png("generic", genericSvg());
