// No crypto word in anything the relayer says to a person: link previews, the preview picture's text, bot replies and
// event lines. Everything is generated from the real fixtures and every kind of event, then scanned.
process.env.TZ = "UTC";
import { describe, expect, test } from "bun:test";
import { diff, messages, type Event } from "./events";
import { CLOSED, edit, fixture, SATURDAY } from "./fixtures";
import { circleSvg, genericSvg, previewFor, previewLine, shareHtml, genericPreview } from "./share";
import { circleText } from "./telegram";
import { words } from "./words";

export const BANNED = /\b(wallet|gas|token|chain|blockchain|crypto|ausd|usdc|mon|monad|testnet|address|hash|transaction|tx|seed|private key|gwei|contract|erc-?20|web3|nft|metamask|defi)\b|0x[0-9a-f]{6}/i;
export const found = (texts: string[]) => texts.filter((t) => BANNED.test(t));

const live = fixture(SATURDAY).snapshot;
const closed = fixture(CLOSED).snapshot;
const now = Number(live.opensAt) + 100;

/** Every string in `words`, calling the functions with sample arguments. */
function walk(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (typeof v === "function") {
    const f = v as (...a: never[]) => unknown;
    const r = (f as (...a: unknown[]) => unknown)(["Ada", "Tolu"], 2, 5, "Ada", "Fri 16 Oct", "$10", "Saturday Ajo");
    if (typeof r === "string") out.push(r);
  } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x, out);
  return out;
}

const everyEvent: Event[] = [
  { kind: "joined", names: ["Ada"] },
  { kind: "started" },
  { kind: "paid", names: ["Ada", "Tolu"], round: 2 },
  { kind: "payout", round: 1, to: "Ngozi", amount: 10_000_000n },
  { kind: "payout", round: 1, to: "Ngozi", amount: null },
  { kind: "covered", names: ["Bisi"], by: "set-aside" },
  { kind: "covered", names: ["Bisi"], by: "guarantee" },
  { kind: "covered", names: ["Bisi"], by: "both" },
  { kind: "short", names: ["Bisi"], round: 1, to: "Ngozi" },
  { kind: "closed" },
  { kind: "returned", setAsides: true, guarantee: true },
  { kind: "returned", setAsides: true, guarantee: false },
  { kind: "returned", setAsides: false, guarantee: true },
];

describe("what people read outside the app", () => {
  const texts = [
    ...walk(words),
    ...messages(everyEvent, live),
    ...messages(everyEvent, closed),
    previewLine(live, now),
    previewLine(closed, now),
    circleText(live),
    circleText(closed),
    shareHtml(previewFor(live, now)).replace(/<meta property="og:(url|image)"[^>]*>|<meta name="twitter:image"[^>]*>|<a href[^>]*>/g, ""),
    shareHtml(genericPreview()).replace(/<meta property="og:(url|image)"[^>]*>|<meta name="twitter:image"[^>]*>/g, ""),
    ...[circleSvg(live, now), circleSvg(closed, now), genericSvg()].flatMap((svg) => [...svg.matchAll(/>([^<>]+)<\/text>/g)].map((m) => m[1]!)),
  ];

  test("the scan is not empty", () => {
    expect(texts.length).toBeGreaterThan(100);
    expect(texts.some((t) => t.includes("collected"))).toBe(true);
  });

  test("no banned word anywhere", () => {
    expect(found(texts)).toEqual([]);
  });

  test("the scan can fail: it catches each word on a realistic line", () => {
    for (const w of ["wallet", "gas", "token", "chain", "AUSD", "MON", "address", "transaction", "hash", "0x4e1afd"]) {
      expect(found([`Ada paid, ${w} sent`, "Ada paid."])).toEqual([`Ada paid, ${w} sent`]);
    }
    // and a banned word injected into the real copy is caught
    const bad = edit(live, (c) => (c.name = "Saturday wallet"));
    expect(found([previewFor(bad, now).title, ...messages(diff(edit(live, (c) => (c.members[0]!.member = "0x0000000000000000000000000000000000000000")), bad), bad)])).not.toEqual([]);
  });
});
