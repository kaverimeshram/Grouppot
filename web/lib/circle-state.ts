// What a circle snapshot means to a person: who is paid, whose turn it is, what the one sentence says, what the one
// button does. Pure functions over the chain read, so they are testable without a browser.
import type { Address } from "viem";
import { clearsEarlySlot, dollars, type PaymentRecord, type Snapshot } from "./chain";
import { copy } from "./copy";
import { sameAddress } from "./session";
import { countdown, formatDay, formatWhen } from "./time";

export const ZERO = "0x0000000000000000000000000000000000000000";

export type Status = "open" | "paid" | "notyet" | "covered" | "stopped" | "collected";

export const num = (v: bigint) => Number(v);
export const isDone = (s: Snapshot) => s.round >= s.size;
export const isStarted = (s: Snapshot) => s.start > 0n;
export const isRoundOpen = (s: Snapshot, now: number) => isStarted(s) && !isDone(s) && now >= num(s.opensAt);
export const pot = (s: Snapshot) => s.size * s.contribution;
export const openSlots = (s: Snapshot) => s.members.flatMap((m, i) => (m.member === ZERO ? [i] : []));
export const recipientName = (s: Snapshot) => (isDone(s) ? "" : s.members[num(s.round)]!.label);

/// The organiser's own name when she is a member of the circle; otherwise plain "The organiser".
/// `own` is the name this phone has on record for the organiser, used only on the organiser's own phone.
export const organiserName = (s: Snapshot, own?: string) =>
  s.members.find((m) => sameAddress(m.member, s.organiser))?.label ?? (own || copy.circle.theOrganiser);

/// The organiser as a name in the middle of a sentence ("Ask Ada", "Ask the organiser").
export const organiserInline = (s: Snapshot, own?: string) => {
  const n = organiserName(s, own);
  return n === copy.circle.theOrganiser ? copy.circle.theOrganiserInline : n;
};

export function statusOf(s: Snapshot, i: number): Status {
  const m = s.members[i]!;
  if (m.member === ZERO) return "open";
  if (isDone(s)) return "collected";
  if (m.paidThisRound) return "paid";
  if (m.defaults > 0n) return m.reserveBal === 0n ? "stopped" : "covered";
  return "notyet";
}

/// When slot `i` collects: when its round is due, or the round number alone before the circle has started.
export function collectCaption(s: Snapshot, i: number): string {
  const round = i + 1;
  if (isDone(s) || i < num(s.round)) return copy.circle.collectedRound(round);
  if (!isStarted(s)) return copy.circle.collectsRound(round);
  if (i === num(s.round)) return copy.circle.collectsNow(round);
  return copy.circle.collectsAt(round, formatDay(num(s.start) + (i + 1) * num(s.period)));
}

export function sentence(s: Snapshot, now: number): string {
  if (isDone(s)) return copy.circle.sentenceDone;
  const who = recipientName(s);
  if (!isStarted(s)) return s.joined === 0n ? copy.circle.sentenceEmpty : copy.circle.sentenceFilling(num(s.joined), num(s.size));
  if (now < num(s.opensAt)) {
    const when = formatWhen(num(s.opensAt), now);
    return s.paidCount > 0n ? copy.circle.sentenceAhead(num(s.paidCount), num(s.size), num(s.round) + 1, when) : copy.circle.sentenceNotOpen(num(s.round) + 1, when);
  }
  if (s.paidCount === s.size) return copy.circle.sentenceAllPaid(who);
  if (now > num(s.dueAt) + 120) return copy.circle.sentenceSlow;
  if (now > num(s.dueAt)) return copy.circle.sentenceTimeUp(who);
  return copy.circle.sentencePaid(num(s.paidCount), num(s.size), who, payoutBy(s, now));
}

/// The line under the sentence: how long until the round is due, or when it opens.
export function clockLine(s: Snapshot, now: number): { label: string; value: string } | null {
  if (!isStarted(s) || isDone(s)) return null;
  if (now < num(s.opensAt)) return null;
  if (s.paidCount === s.size || now > num(s.dueAt)) return null;
  return { label: copy.circle.dueIn, value: countdown(num(s.dueAt) - now) };
}

/// The one rule for when the pot lands, shared by the ring centre, the sentence and (through the due date) the member
/// rows: by the round's due date. It lands sooner when everyone pays, which the sentence says in words.
export function payoutBy(s: Snapshot, now: number): string {
  if (now >= num(s.dueAt) || (s.paidCount === s.size && now >= num(s.opensAt))) return copy.circle.anyMoment;
  return copy.time.by(formatWhen(num(s.dueAt), now));
}

export function centre(s: Snapshot, now: number): { big: string; small: string } {
  if (isDone(s)) return { big: copy.circle.centreDone, small: copy.circle.centreDoneSub };
  const small = !isStarted(s)
    ? `${copy.circle.centreTo(recipientName(s))} ${copy.circle.centreWhenFull}`
    : `${copy.circle.centreTo(recipientName(s))}, ${payoutBy(s, now)}`;
  return { big: dollars(pot(s)), small };
}

/// The trust line shown before anyone pays. Worst case beyond the guarantee is one contribution per uncovered round.
export function trustLine(s: Snapshot, own?: string): string {
  const each = dollars(s.contribution);
  const rounds = Number(s.bond / s.contribution);
  return rounds > 0
    ? copy.circle.trustBacked(organiserName(s, own), rounds, dollars(s.bond), each)
    : copy.circle.trustUnbacked(each);
}

export type Primary = "join" | "pay" | "nudge" | "invite" | "share" | "none";

export function primaryFor(o: {
  s: Snapshot;
  now: number;
  meIndex: number; // -1 when this phone is not a member
  isOrganiser: boolean;
  hasInvite: boolean;
}): Primary {
  const { s, now, meIndex, isOrganiser, hasInvite } = o;
  const free = openSlots(s).length > 0;
  const someoneUnpaid = isRoundOpen(s, now) && s.members.some((m) => m.member !== ZERO && !m.paidThisRound);
  if (meIndex < 0) {
    if (free && hasInvite) return "join";
    return isOrganiser && someoneUnpaid ? "nudge" : "none";
  }
  if (isRoundOpen(s, now) && !s.members[meIndex]!.paidThisRound) return "pay";
  if (isOrganiser) {
    if (free && hasInvite) return "invite";
    if (someoneUnpaid) return "nudge";
  }
  return "share";
}

export const meIndexOf = (s: Snapshot, me: Address | null | undefined) => s.members.findIndex((m) => sameAddress(m.member, me));

/// What a member's row says about their history: one short line, from the factory's record of every circle it made.
export function recordLine(r: PaymentRecord): string {
  if (r.paid === 0 && r.missed === 0) return copy.record.newHere;
  const rounds = copy.record.paid(r.paid, r.missed);
  return r.finished > 0 ? `${rounds}, ${copy.record.finished(r.finished)}` : rounds;
}

export type Terms = { earlySlots: number; minPaid: number };
export const isKeptPlace = (slot: number, t: Terms) => slot < t.earlySlots;

/// What a person trying to take place `slot` is told once their own record is known: null when they may take it.
export function keptPlaceBlock(slot: number, t: Terms, r: PaymentRecord, open: number[]): string | null {
  if (!isKeptPlace(slot, t) || clearsEarlySlot(r, t.minPaid)) return null;
  return copy.join.keptNotYet(r.paid, r.missed, t.minPaid, open.some((i) => !isKeptPlace(i, t)));
}

/// The record line under a row: a joined member's history, or for an open kept place what it is kept for. Nothing
/// when the record could not be read, never a guess.
export function recordCaption(s: Snapshot, i: number, t: Terms, records: Record<string, PaymentRecord>): string | undefined {
  const m = s.members[i]!;
  if (m.member === ZERO) return isKeptPlace(i, t) ? copy.record.kept(t.minPaid) : undefined;
  const r = records[m.member.toLowerCase()];
  return r ? recordLine(r) : undefined;
}
