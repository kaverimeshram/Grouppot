// diff() over real testnet snapshots (relayer/fixtures, each pinned to the block it was read at). A "previous" state is
// cut from a real snapshot by editing a copy; the expected lines are exact.
import { describe, expect, test } from "bun:test";
import { createPublicClient, http, type Address } from "viem";
import { circleAbi } from "../web/lib/abi";
import { diff, messages } from "./events";
import { CLOSED, edit, fixture, SATURDAY } from "./fixtures";
import { ZERO } from "../web/lib/circle-state";

const live = fixture(SATURDAY).snapshot; // Saturday Ajo, round 2 of 5, four of five already paid
const closed = fixture(CLOSED).snapshot; // Lagos Practice Ajo, three rounds done, set-asides back
const say = (prev: typeof live, cur: typeof live) => messages(diff(prev, cur), cur);

describe("real snapshots", () => {
  test("fixtures are the circles they claim to be, and not empty", () => {
    expect(live.name).toBe("Saturday Ajo");
    expect(live.members.map((m) => m.label)).toEqual(["Ngozi", "Ada", "Tolu", "Bisi", "Kemi"]);
    expect(live.paidCount).toBe(4n);
    expect(closed.name).toBe("Lagos Practice Ajo");
    expect(closed.round).toBe(closed.size);
  });

  test("nothing changed, nothing said", () => {
    expect(say(live, live)).toEqual([]);
    expect(say(closed, closed)).toEqual([]);
  });

  test("the chain still returns these circles in this shape", async () => {
    const pub = createPublicClient({ transport: http(process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", { retryCount: 4, retryDelay: 500 }) });
    for (const [addr, pinned] of [[SATURDAY, live], [CLOSED, closed]] as const) {
      const now = { ...(await pub.readContract({ address: addr as Address, abi: circleAbi, functionName: "snapshot" })), address: addr as Address };
      expect(now.name).toBe(pinned.name);
      expect(now.members.map((m) => m.label)).toEqual(pinned.members.map((m) => m.label));
      expect(now.members.length).toBe(Number(pinned.size));
    }
  });
});

describe("a round in progress", () => {
  test("one member paid", () => {
    const prev = edit(live, (c) => {
      c.members[4]!.paidThisRound = false;
      c.paidCount = 3n;
    });
    expect(say(prev, live)).toEqual(["Kemi paid for round 2. 4 of 5 paid."]);
  });

  test("several members paid in one pass read as one line", () => {
    const prev = edit(live, (c) => {
      c.members[2]!.paidThisRound = false;
      c.members[4]!.paidThisRound = false;
      c.paidCount = 2n;
    });
    expect(say(prev, live)).toEqual(["Tolu and Kemi paid for round 2. 4 of 5 paid."]);
  });

  test("the last payment says who collects", () => {
    const cur = edit(live, (c) => {
      c.members[3]!.paidThisRound = true;
      c.paidCount = 5n;
    });
    expect(say(live, cur)).toEqual(["Bisi paid for round 2. Everyone paid. Ada collects any moment now."]);
  });

  test("a member joining", () => {
    const prev = edit(live, (c) => {
      c.members[3]!.member = ZERO;
      c.members[3]!.paidThisRound = false;
      c.joined = 4n;
      c.paidCount = 3n;
    });
    expect(say(prev, live)).toEqual(["Bisi joined. 5 of 5 have joined."]);
  });
});

describe("a circle filling and starting", () => {
  const started = edit(live, (c) => {
    c.round = 0n;
    c.paidCount = 5n;
    c.members.forEach((m) => (m.paidThisRound = true));
  });
  const filling = edit(started, (c) => {
    c.start = 0n;
    c.opensAt = 0n;
    c.dueAt = 0n;
    c.joined = 4n;
    c.paidCount = 4n;
    c.members[4]!.member = ZERO;
    c.members[4]!.paidThisRound = false;
  });
  test("the last member joins and the circle starts", () => {
    expect(say(filling, started)).toEqual([
      "Kemi joined. 5 of 5 have joined.",
      "Saturday Ajo is full and has started. Round 1 of 5: Ngozi collects $10 by Fri 16 Oct.",
    ]);
  });
});

describe("a payout", () => {
  const before = edit(live, (c) => {
    c.round = 0n;
    c.paidCount = 5n;
    c.members.forEach((m) => (m.paidThisRound = true));
  });
  test("lands on the collector, with the amount, and the payments already in for the next round", () => {
    expect(say(before, live)).toEqual([
      "Ngozi collected $10 for round 1 of 5.",
      "Ngozi, Ada, Tolu and Kemi paid for round 2. 4 of 5 paid.",
    ]);
  });
  test("no amount is claimed when the collector's own set-aside moved", () => {
    const prev = edit(before, (c) => (c.members[0]!.reserveBal = 0n));
    expect(say(prev, live)[0]).toBe("Ngozi collected round 1 of 5.");
  });
});

describe("a member who misses a round", () => {
  // round 1 of Saturday Ajo ends with Bisi unpaid: before = everyone but Bisi paid, after = round advanced, Bisi missed
  const before = edit(live, (c) => {
    c.round = 0n;
    c.paidCount = 4n;
    c.members.forEach((m) => (m.paidThisRound = m.label !== "Bisi"));
  });
  const after = (change: (c: typeof live) => void) =>
    edit(live, (c) => {
      c.members.forEach((m) => (m.paidThisRound = false));
      c.paidCount = 0n;
      c.members[3]!.defaults = 1n;
      change(c);
    });

  test("covered by their own set-aside", () => {
    const cur = after((c) => (c.members[3]!.reserveBal = 0n));
    expect(say(before, cur)).toEqual(["Ngozi collected $10 for round 1 of 5.", "Bisi missed a round. It was covered, so everyone was paid in full."]);
  });

  test("covered by the guarantee when the set-aside is already spent", () => {
    const prev = edit(before, (c) => (c.members[3]!.reserveBal = 0n));
    const cur = after((c) => {
      c.members[3]!.reserveBal = 0n;
      c.bond = 2_000_000n;
    });
    expect(say(prev, cur)).toEqual(["Ngozi collected $10 for round 1 of 5.", "Bisi missed a round. The organiser's guarantee covered it, so everyone was paid in full."]);
  });

  test("not covered in full: the collector is paid less and the amount is not claimed", () => {
    const prev = edit(before, (c) => {
      c.members[3]!.reserveBal = 0n;
      c.bond = 0n;
    });
    const cur = after((c) => {
      c.members[3]!.reserveBal = 0n;
      c.bond = 0n;
    });
    expect(say(prev, cur)).toEqual(["Ngozi collected round 1 of 5.", "Bisi stopped paying. Round 1 was not covered in full, so Ngozi collected less."]);
  });
});

describe("the end of a circle", () => {
  const lastRound = edit(closed, (c) => {
    c.round = 2n;
    c.paidCount = 3n;
    c.bond = 2_000_000n;
    c.members.forEach((m) => {
      m.paidThisRound = true;
      m.reserveBal = 2_000_000n;
    });
  });
  const doneHeld = edit(closed, (c) => {
    c.bond = 2_000_000n;
    c.members.forEach((m) => (m.reserveBal = 2_000_000n));
  });

  test("the last payout closes the circle", () => {
    expect(say(lastRound, doneHeld)).toEqual(["Tolu collected $6 for round 3 of 3.", "Lagos Practice Ajo is complete. Everyone has collected."]);
  });

  test("set-asides and the guarantee going back", () => {
    expect(say(doneHeld, closed)).toEqual(["Set-asides are back with each member and the guarantee is back with the organiser."]);
  });

  test("set-asides back first, the guarantee later, each said once", () => {
    const mid = edit(closed, (c) => (c.bond = 2_000_000n));
    expect(say(doneHeld, mid)).toEqual(["Set-asides are back with each member."]);
    expect(say(mid, closed)).toEqual(["The guarantee is back with the organiser."]);
  });

  test("a set-aside still on its way back is not announced early", () => {
    const part = edit(doneHeld, (c) => (c.members[0]!.reserveBal = 0n));
    expect(say(doneHeld, part)).toEqual([]);
  });
});
