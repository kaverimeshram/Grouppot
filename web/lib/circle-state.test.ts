import { expect, test } from "bun:test";
import type { Snapshot } from "./chain";
import { organiserName, primaryFor, sentence, statusOf, trustLine, ZERO } from "./circle-state";
import { countdown, formatWhen } from "./time";

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
  expect(sentence(circle(ms, { round: 1n, paidCount: 2n, opensAt: 1_600n, dueAt: 2_200n }), 1_900)).toBe("2 of 3 paid. Ada collects in 5 min.");
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
