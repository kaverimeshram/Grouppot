import { expect, test } from "bun:test";
import type { PaymentRecord, Snapshot } from "./chain";
import { copy } from "./copy";
import { centre, collectCaption, keptPlaceBlock, organiserName, payoutBy, primaryFor, recordCaption, recordLine, sentence, statusOf, trustLine, ZERO } from "./circle-state";
import { countdown, formatDay, formatWhen } from "./time";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const C3 = "0x00000000000000000000000000000000000000c3";
const D = "0x00000000000000000000000000000000000000d4";
const E = (n: number) => BigInt(n) * 1_000_000n;

type M = Snapshot["members"][number];
const member = (who: string, label: string, over: Partial<M> = {}): M => ({
  member: who as M["member"],
  label,
  paidThisRound: false,
  standing: true,
  cash: 0n,
  reserveBal: E(10),
  defaults: 0n,
  owes: 0n,
  ...over,
});
const circle = (members: M[], over: Partial<Snapshot> = {}): Snapshot =>
  ({
    name: "Saturday Ajo",
    organiser: A,
    contribution: E(10),
    period: 600n,
    size: BigInt(members.length),
    joined: BigInt(members.filter((m) => m.member !== ZERO).length),
    start: 1_000n,
    round: 1n,
    paidCount: 0n,
    opensAt: 1_600n,
    dueAt: 2_200n,
    bond: E(20),
    bondPosted: E(20),
    balance: 0n,
    members,
    address: "0x00000000000000000000000000000000000000f0",
    ...over,
  }) as Snapshot;

test("a member's row says what the circle knows about them", () => {
  const s = circle([
    member(A, "Ngozi", { paidThisRound: true }),
    member(B, "Ada"),
    member(C3, "Tolu", { defaults: 1n, reserveBal: E(10) }),
    member(D, "Bisi", { defaults: 2n, reserveBal: 0n }),
    member(ZERO, "Kemi"),
  ]);
  expect([0, 1, 2, 3, 4].map((i) => statusOf(s, i))).toEqual(["paid", "notyet", "covered", "stopped", "open"]);
  expect(statusOf({ ...s, round: s.size }, 1)).toBe("collected");
});

test("the one sentence follows the round", () => {
  const ms = [member(A, "Ngozi"), member(B, "Ada", { paidThisRound: true }), member(C3, "Tolu", { paidThisRound: true })];
  expect(sentence(circle(ms, { round: 1n, paidCount: 2n, opensAt: 1_600n, dueAt: 2_200n }), 1_900)).toBe("2 of 3 paid. Ada collects in 5 min, sooner if everyone pays.");
  expect(sentence(circle(ms, { round: 1n, paidCount: 3n }), 1_900)).toBe("Everyone paid. Ada collects any moment now.");
  expect(sentence(circle(ms, { round: 1n }), 1_000)).toMatch(/^Round 2 opens .* Nothing is due yet\.$/);
  expect(sentence(circle(ms, { start: 0n, joined: 0n, members: ms.map((m) => ({ ...m, member: ZERO as M["member"] })) }), 1_000)).toBe("Nobody has joined yet. Send the link to your group.");
});

test("the trust line is computed from the guarantee, never a constant", () => {
  const ms = [member(A, "Ngozi"), member(B, "Ada"), member(C3, "Tolu")];
  expect(trustLine(circle(ms, { bond: E(20) }))).toBe(
    "Ngozi backs this circle for 2 missed rounds ($20). Beyond that, a missed round can leave that round's collector short by up to $10.",
  );
  expect(trustLine(circle(ms, { bond: E(5), contribution: E(5) }))).toContain("1 missed round ($5)");
  expect(trustLine(circle(ms, { bond: 0n }))).toStartWith("Nobody has backed this circle yet.");
  expect(organiserName(circle([member(B, "Ada")]))).toBe("The organiser");
});

test("one primary button, chosen by who is looking and what is due", () => {
  const ms = [member(A, "Ngozi"), member(B, "Ada", { paidThisRound: true }), member(C3, "Tolu")];
  const open = circle(ms, { round: 1n });
  const now = 1_700;
  expect(primaryFor({ s: open, now, meIndex: 2, isOrganiser: false, hasInvite: false })).toBe("pay");
  expect(primaryFor({ s: open, now, meIndex: 1, isOrganiser: false, hasInvite: false })).toBe("share");
  expect(primaryFor({ s: open, now, meIndex: 1, isOrganiser: true, hasInvite: true })).toBe("nudge");
  expect(primaryFor({ s: open, now: 1_100, meIndex: 2, isOrganiser: false, hasInvite: false })).toBe("share");
  const filling = circle([member(A, "Ngozi", { paidThisRound: true }), member(ZERO, "Ada"), member(ZERO, "Tolu")], { start: 0n, round: 0n });
  expect(primaryFor({ s: filling, now, meIndex: -1, isOrganiser: false, hasInvite: true })).toBe("join");
  expect(primaryFor({ s: filling, now, meIndex: -1, isOrganiser: false, hasInvite: false })).toBe("none");
  expect(primaryFor({ s: filling, now, meIndex: 0, isOrganiser: true, hasInvite: true })).toBe("invite");
});

test("times read as people say them", () => {
  const now = 1_790_000_000;
  expect(formatWhen(now + 360, now)).toBe("in 6 min");
  expect(formatWhen(now + 20, now)).toBe("in under a minute");
  expect(formatWhen(now - 5, now)).toBe("now");
  expect(formatWhen(now + 3 * 86_400, now)).toMatch(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2}(:\d\d)?(am|pm)$/);
  expect(countdown(2 * 86_400 + 4 * 3600)).toBe("2 days 4 hours");
  expect(countdown(5 * 3600 + 12 * 60)).toBe("5h 12m");
  expect(countdown(42 * 60 + 10)).toBe("42m 10s");
});

const NOW = 1_790_000_000;
const WEEK = 604_800n;
const DAY = 86_400;

test("the ring centre, the sentence and the member rows give the payout time by one rule: the due date", () => {
  const ms = [member(A, "Ngozi"), member(B, "Ada"), member(C3, "Tolu")];
  const start = BigInt(NOW - 3 * DAY);
  // round 1 is current: it opens in 4 days and is due 11 days from now, every standing order in place
  const s1 = circle(ms, { start, period: WEEK, round: 1n, opensAt: start + WEEK, dueAt: start + 2n * WEEK });
  const due = formatDay(Number(start + 2n * WEEK));
  // before the round opens the centre must show the due date, not the opening (the bug judge pass 2 found)
  expect(centre(s1, NOW).small).toBe(`to Ada, by ${due}`);
  // and it is the same date the row for that round shows while the round before it is still current
  const s0 = circle(ms, { start, period: WEEK, round: 0n, opensAt: start, dueAt: start + WEEK });
  expect(collectCaption(s0, 1)).toBe(copy.circle.collectsAt(2, due));

  // in every state where the sentence names a payout time, the centre names the same one
  const open = Number(start + WEEK) + 1;
  const states: [Snapshot, number][] = [
    [s1, open],
    [{ ...s1, paidCount: 2n, members: ms.map((m, i) => ({ ...m, paidThisRound: i > 0 })) }, open],
    [{ ...s1, paidCount: 3n }, open],
    [s1, Number(start + 2n * WEEK) + 30],
    [s1, Number(start + 2n * WEEK) - 300],
  ];
  let named = 0;
  for (const [s, now] of states) {
    const line = sentence(s, now);
    if (!/collects/.test(line)) continue;
    named++;
    expect(line).toContain(payoutBy(s, now));
    expect(centre(s, now).small.endsWith(payoutBy(s, now))).toBe(true);
  }
  expect(named).toBe(5);
  expect(payoutBy(s1, open)).toBe(`by ${due}`);
  expect(payoutBy({ ...s1, paidCount: 3n }, open)).toBe("any moment now");
});

const rec = (over: Partial<PaymentRecord> = {}): PaymentRecord => ({ paid: 0, missed: 0, finished: 0, finishedClean: 0, ...over });

test("a record reads as one short plain line", () => {
  expect(recordLine(rec())).toBe("New here");
  expect(recordLine(rec({ paid: 1 }))).toBe("1 round paid, none missed");
  expect(recordLine(rec({ paid: 12 }))).toBe("12 rounds paid, none missed");
  expect(recordLine(rec({ paid: 9, missed: 1 }))).toBe("9 rounds paid, 1 missed");
  expect(recordLine(rec({ paid: 12, finished: 1, finishedClean: 1 }))).toBe("12 rounds paid, none missed, 1 circle finished");
  expect(recordLine(rec({ paid: 12, finished: 2, finishedClean: 1 }))).toBe("12 rounds paid, none missed, 2 circles finished");
});

test("a kept place stops exactly the records the contract rejects, with the person's own numbers", () => {
  const terms = { earlySlots: 2, minPaid: 3 };
  expect(copy.newCircle.keepLive(2, 3)).toBe("The first 2 places go to people who have paid at least 3 rounds and never missed one.");
  expect(copy.newCircle.keepLive(1, 1)).toBe("The first place goes to someone who has paid at least 1 round and never missed one.");
  expect(copy.join.keptPlace(3)).toBe("This place is kept for members who have paid at least 3 rounds and never missed one.");
  const later = [0, 3];
  expect(keptPlaceBlock(0, terms, rec({ paid: 1 }), later)).toBe(
    "You have paid 1 round and missed none. This place needs at least 3 rounds paid and none missed. Pick a later place, those are open to everyone.",
  );
  expect(keptPlaceBlock(1, terms, rec({ paid: 5, missed: 1 }), later)).toStartWith("You have paid 5 rounds and missed 1. ");
  expect(keptPlaceBlock(0, terms, rec(), [0, 1])).toEndWith("No later place is open right now.");
  expect(keptPlaceBlock(0, terms, rec({ paid: 2 }), later)).not.toBeNull();
  expect(keptPlaceBlock(0, terms, rec({ paid: 3 }), later)).toBeNull();
  expect(keptPlaceBlock(0, terms, rec({ paid: 40, missed: 1 }), later)).not.toBeNull();
  expect(keptPlaceBlock(2, terms, rec(), later)).toBeNull();
  expect(keptPlaceBlock(0, { earlySlots: 0, minPaid: 0 }, rec(), later)).toBeNull();
});

test("rows show a joined member's record, and what an open kept place is kept for", () => {
  const s = circle([member(A, "Ngozi"), member(B, "Ada"), member(ZERO, "Tolu"), member(ZERO, "Bisi")], { start: 0n, round: 0n });
  const terms = { earlySlots: 3, minPaid: 3 };
  const records = { [A]: rec({ paid: 12 }), [B]: rec() };
  expect([0, 1, 2, 3].map((i) => recordCaption(s, i, terms, records))).toEqual(["12 rounds paid, none missed", "New here", "Kept for 3+ rounds paid, none missed", undefined]);
  expect(recordCaption(s, 0, terms, {})).toBeUndefined();
});
