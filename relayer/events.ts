// What changed in a circle between two reads, as plain messages. Pure: snapshots in, text out. The keeper's pass and the
// Telegram bot call it; events.test.ts runs it over real testnet snapshots.
import { type Snapshot } from "../web/lib/chain";
import { isDone, isStarted, num, pot, recipientName, ZERO } from "../web/lib/circle-state";
import { dollars } from "../web/lib/chain";
import { formatDay } from "../web/lib/time";
import { words } from "./words";

export type Event =
  | { kind: "joined"; names: string[] }
  | { kind: "started" }
  | { kind: "paid"; names: string[]; round: number }
  | { kind: "payout"; round: number; to: string; amount: bigint | null }
  | { kind: "covered"; names: string[]; by: "set-aside" | "guarantee" | "both" }
  | { kind: "short"; names: string[]; round: number; to: string }
  | { kind: "closed" }
  | { kind: "returned"; setAsides: boolean; guarantee: boolean };

const sum = (s: Snapshot) => s.members.reduce((t, m) => t + m.reserveBal, 0n);

/// Every event that took the circle from `prev` to `cur`, in the order they happened.
export function diff(prev: Snapshot, cur: Snapshot): Event[] {
  const out: Event[] = [];
  const joined = cur.members.flatMap((m, i) => (prev.members[i]?.member === ZERO && m.member !== ZERO ? [m.label] : []));
  if (joined.length) out.push({ kind: "joined", names: joined });
  if (!isStarted(prev) && isStarted(cur)) out.push({ kind: "started" });

  const r0 = num(prev.round);
  const r1 = num(cur.round);
  if (r1 > r0) {
    const steps = r1 - r0;
    const collector = prev.members[r0]!;
    // who missed, and what covered it: a miss costs the member's set-aside first, then the guarantee
    let guaranteeLeft = prev.bond > cur.bond ? prev.bond - cur.bond : 0n;
    const covered: { name: string; by: "set-aside" | "guarantee" | "both" }[] = [];
    const short: string[] = [];
    let exact = steps === 1 && prev.members[r0]!.owes === 0n && collector.reserveBal === cur.members[r0]!.reserveBal;
    cur.members.forEach((m, i) => {
      const missed = m.defaults - (prev.members[i]?.defaults ?? 0n);
      if (missed <= 0n) return;
      const isCollector = steps === 1 && i === r0;
      let need = isCollector ? 0n : missed * cur.contribution;
      const drop = prev.members[i]!.reserveBal - m.reserveBal;
      const fromSetAside = isCollector || drop < 0n ? 0n : drop < need ? drop : need;
      need -= fromSetAside;
      const fromGuarantee = guaranteeLeft < need ? guaranteeLeft : need;
      guaranteeLeft -= fromGuarantee;
      need -= fromGuarantee;
      if (need > 0n || isCollector) {
        short.push(m.label);
        exact = false;
      } else covered.push({ name: m.label, by: fromGuarantee === 0n ? "set-aside" : fromSetAside === 0n ? "guarantee" : "both" });
    });
    for (let r = r0; r < r1; r++) {
      out.push({ kind: "payout", round: r + 1, to: prev.members[r]!.label, amount: exact && r === r0 ? pot(prev) : null });
    }
    for (const by of ["set-aside", "guarantee", "both"] as const) {
      const names = covered.filter((c) => c.by === by).map((c) => c.name);
      if (names.length) out.push({ kind: "covered", names, by });
    }
    if (short.length) out.push({ kind: "short", names: short, round: r1, to: collector.label });
    // payments already in for the round that just opened
    const early = cur.members.filter((m) => m.paidThisRound).map((m) => m.label);
    if (!isDone(cur) && early.length) out.push({ kind: "paid", names: early, round: r1 + 1 });
  } else if (isStarted(cur) && !isDone(cur)) {
    // a member's first payment is made as they join, which the "joined" line already says
    const names = cur.members.flatMap((m, i) => (m.paidThisRound && !prev.members[i]?.paidThisRound && prev.members[i]?.member !== ZERO ? [m.label] : []));
    if (names.length) out.push({ kind: "paid", names, round: r1 + 1 });
  }

  if (!isDone(prev) && isDone(cur)) out.push({ kind: "closed" });
  if (isDone(cur)) {
    const setAsides = sum(prev) > 0n && sum(cur) === 0n;
    const guarantee = prev.bond > 0n && cur.bond === 0n;
    if (setAsides || guarantee) out.push({ kind: "returned", setAsides, guarantee });
  }
  return out;
}

/// One short plain message per event, in order. `cur` supplies names, counts and dollars.
export function messages(events: Event[], cur: Snapshot): string[] {
  const size = num(cur.size);
  return events.map((e) => {
    switch (e.kind) {
      case "joined":
        return words.event.joined(e.names, num(cur.joined), size);
      case "started":
        return words.event.started(cur.name, size, cur.members[0]!.label, formatDay(num(cur.dueAt)), dollars(pot(cur)));
      case "paid":
        return cur.paidCount === cur.size && !isDone(cur)
          ? words.event.paidAll(e.names, e.round, recipientName(cur))
          : words.event.paid(e.names, e.round, num(cur.paidCount), size);
      case "payout":
        return words.event.payout(e.to, e.round, size, e.amount === null ? null : dollars(e.amount));
      case "covered":
        return e.by === "set-aside" ? words.event.coveredSetAside(e.names) : e.by === "guarantee" ? words.event.coveredGuarantee(e.names) : words.event.coveredBoth(e.names);
      case "short":
        return words.event.short(e.names, e.round, e.to);
      case "closed":
        return words.event.closed(cur.name);
      case "returned":
        return e.setAsides && e.guarantee ? words.event.returnedBoth : e.setAsides ? words.event.returnedSetAside : words.event.returnedGuarantee;
    }
  });
}
