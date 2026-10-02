// The bot against a fake Telegram HTTP server (the real API needs a token) and the pinned real circles. Covers the
// commands, the events posted to a watching chat, restart without re-announcing, and that the token never reaches a log.
process.env.TZ = "UTC";
import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Address } from "viem";
import type { Snapshot } from "../web/lib/chain";
import { CLOSED, edit, fixture, SATURDAY } from "./fixtures";
import { stringify } from "./snapshot";
import { circleIn, parseCommand, startTelegram } from "./telegram";

const TOKEN = "123456:FAKE-TOKEN-FOR-TESTS";
const live = fixture(SATURDAY).snapshot;
const closed = fixture(CLOSED).snapshot;

type Sent = { chat_id: number; text: string; reply_markup?: { inline_keyboard: { text: string; url: string }[][] } };
const sent: Sent[] = [];
const offsets: number[] = [];
const queue: unknown[] = [];
let sendFails: Record<number, number> = {}; // chat id -> status the fake answers with
let n = 0;

const fake = Bun.serve({
  port: 0,
  async fetch(req) {
    const method = new URL(req.url).pathname.split("/").pop()!;
    if (!new URL(req.url).pathname.startsWith(`/bot${TOKEN}/`)) return Response.json({ ok: false, error_code: 401 }, { status: 401 });
    const body = (await req.json()) as Record<string, unknown>;
    if (method === "getMe") return Response.json({ ok: true, result: { username: "grouppot_test_bot" } });
    if (method === "setMyCommands") return Response.json({ ok: true, result: true });
    if (method === "getUpdates") {
      offsets.push(body.offset as number);
      if (!queue.length) await new Promise((r) => setTimeout(r, 60));
      return Response.json({ ok: true, result: queue.splice(0) });
    }
    if (method === "sendMessage") {
      const m = body as unknown as Sent;
      if (sendFails[m.chat_id]) return Response.json({ ok: false, error_code: sendFails[m.chat_id] }, { status: sendFails[m.chat_id] });
      sent.push(m);
      return Response.json({ ok: true, result: { message_id: sent.length } });
    }
    return Response.json({ ok: false, error_code: 404 }, { status: 404 });
  },
});
afterAll(() => fake.stop(true));

const say = (chat: number, text: string, type = "group") => queue.push({ update_id: ++n, message: { chat: { id: chat, type }, text } });
const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`timed out waiting for ${what}; sent: ${JSON.stringify(sent.map((s) => s.text))}`);
};
const to = (chat: number) => sent.filter((s) => s.chat_id === chat).map((s) => s.text);

// the circles as the bot reads them: tests move these between passes
const chain: Record<string, Snapshot> = { [SATURDAY]: live, [CLOSED]: closed };
const reads = {
  isCircle: async (c: Address) => c.toLowerCase() in chain,
  snapshot: async (c: Address) => chain[c.toLowerCase()]!,
};
const logs: string[] = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grouppot-tg-"));
const file = path.join(dir, "telegram.json");
const boot = () => startTelegram({ token: TOKEN, reads, file, log: (...a) => logs.push(a.join(" ")), api: `http://localhost:${fake.port}`, watchMs: 10_000_000, minGapMs: 0 });

describe("parsing", () => {
  test("commands, with the bot's name and without", () => {
    expect(parseCommand("/watch https://x/c/?id=0xabc")).toEqual({ command: "watch", arg: "https://x/c/?id=0xabc" });
    expect(parseCommand("/circle@grouppot_bot")).toEqual({ command: "circle", arg: "" });
    expect(parseCommand("/Watch@grouppot_bot  0xabc ")).toEqual({ command: "watch", arg: "0xabc" });
    expect(parseCommand("hello /watch")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
  test("the circle in a pasted link, with or without the invite part", () => {
    const id = SATURDAY;
    expect(circleIn(`https://grouppot.vercel.app/c/?id=${id}`)).toBe(id);
    expect(circleIn(`https://grouppot.vercel.app/c/?id=${id.toUpperCase().replace("0X", "0x")}#k=${"ab".repeat(32)}`)).toBe(id);
    expect(circleIn(id)).toBe(id);
    expect(circleIn(`0x${"a".repeat(41)}`)).toBeNull();
    expect(circleIn("a circle please")).toBeNull();
  });
});

describe("the bot", () => {
  const bot = boot();
  test("starts only after Telegram accepts the token", async () => {
    await until(() => bot.ready(), "getMe");
  });

  test("/start in a private chat explains in two lines", async () => {
    say(1, "/start", "private");
    await until(() => to(1).length === 1, "start reply");
    expect(to(1)[0]!.split("\n")).toHaveLength(2);
    expect(to(1)[0]).toContain("group chat");
  });

  test("/watch refuses what is not a grouppot circle", async () => {
    say(2, "/watch");
    say(2, "/watch not a link");
    say(2, "/watch 0x0000000000000000000000000000000000000001");
    await until(() => to(2).length === 3, "three refusals");
    expect(to(2)[0]).toContain("Send /watch and paste the circle link");
    expect(to(2).slice(1)).toEqual(Array(2).fill("That link does not open a circle. Check it and paste it again."));
    expect(bot.state.chats["2"]).toBeUndefined();
  });

  test("/watch with an invite link follows the circle and never stores the invite", async () => {
    say(2, `/watch@grouppot_test_bot https://grouppot.vercel.app/c/?id=${SATURDAY}#k=${"cd".repeat(32)}`);
    await until(() => to(2).length === 4, "watch reply");
    expect(to(2)[3]).toBe("Watching Saturday Ajo. I will post here when something happens. Send /circle for where it stands, /stop to stop.");
    expect(fs.readFileSync(file, "utf8")).not.toContain("cdcdcd");
    expect(bot.state.chats["2"]!.circle).toBe(SATURDAY);
  });

  test("/circle says where it stands and offers the page", async () => {
    say(2, "/circle");
    await until(() => to(2).length === 5, "circle reply");
    const m = sent.filter((s) => s.chat_id === 2)[4]!;
    expect(m.text.split("\n")[0]).toBe("Saturday Ajo. Round 2 of 5");
    expect(m.text).toContain("Paid: Ngozi, Ada, Tolu and Kemi.");
    expect(m.text).toContain("Not yet: Bisi.");
    expect(m.reply_markup!.inline_keyboard[0]![0]).toEqual({ text: "Open the circle", url: `https://grouppot.vercel.app/c/?id=${SATURDAY}` });
  });

  test("a chat that is not watching is told so", async () => {
    say(3, "/circle");
    await until(() => to(3).length === 1, "not watching");
    expect(to(3)[0]).toContain("not watching a circle yet");
  });

  test("what already happened is not announced, a new payment is, once", async () => {
    await bot.watchPass();
    expect(to(2)).toHaveLength(5);
    chain[SATURDAY] = edit(live, (c) => {
      c.members[3]!.paidThisRound = true;
      c.paidCount = 5n;
    });
    await bot.watchPass();
    expect(to(2)).toHaveLength(6);
    expect(to(2)[5]).toBe("Bisi paid for round 2. Everyone paid. Ada collects any moment now.");
    await bot.watchPass();
    expect(to(2)).toHaveLength(6);
  });

  test("a chat that watches nothing hears nothing", () => {
    expect(to(3)).toHaveLength(1);
    expect(to(1)).toHaveLength(1);
  });

  test("offset is persisted after each batch", () => {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { offset: number };
    expect(saved.offset).toBe(n + 1);
  });

  test("a restart does not re-announce, and announces what happened while it was down, once", async () => {
    await bot.stop();
    chain[SATURDAY] = edit(chain[SATURDAY]!, (c) => {
      c.members[0]!.paidThisRound = false;
      c.paidCount = 4n; // Ngozi's payment was in the saved state; the circle moved on while the bot was off
    });
    const before = sent.length;
    const again = boot();
    await until(() => again.ready(), "restart");
    await again.watchPass(); // the pass the bot runs on start
    expect(offsets.at(-1)).toBeGreaterThanOrEqual(n); // asked Telegram only for updates after the saved offset
    await again.watchPass();
    await again.watchPass();
    expect(sent.slice(before).filter((s) => s.chat_id === 2)).toHaveLength(0); // a payment going missing is not an event
    chain[SATURDAY] = edit(chain[SATURDAY]!, (c) => {
      c.members[0]!.paidThisRound = true;
      c.paidCount = 5n;
    });
    await again.watchPass();
    await again.watchPass();
    expect(sent.slice(before).filter((s) => s.chat_id === 2).map((s) => s.text)).toEqual(["Ngozi paid for round 2. Everyone paid. Ada collects any moment now."]);
    await again.stop();
  });

  test("/watch on another circle switches, /stop stops", async () => {
    const b = boot();
    await until(() => b.ready(), "third boot");
    await b.watchPass();
    say(2, `/watch ${CLOSED}`);
    await until(() => to(2).some((t) => t.startsWith("Now watching Lagos Practice Ajo")), "switch");
    expect(b.state.chats["2"]!.circle).toBe(CLOSED);
    expect(b.state.seen[SATURDAY]).toBeUndefined(); // nobody follows Saturday Ajo now, its baseline is dropped
    say(2, "/circle");
    await until(() => to(2).at(-1)!.startsWith("Lagos Practice Ajo. Done"), "circle for the closed one");
    say(2, "/stop");
    await until(() => to(2).at(-1) === "Stopped. I will not post here any more. Send /watch to start again.", "stop");
    say(2, "/stop");
    await until(() => to(2).at(-1) === "This chat was not watching a circle.", "stop twice");
    const count = sent.length;
    chain[CLOSED] = edit(closed, (c) => (c.joined = 2n));
    await b.watchPass();
    expect(sent.length).toBe(count);
    await b.stop();
  });

  test("a chat that removed the bot is forgotten, not retried", async () => {
    const b = boot();
    await until(() => b.ready(), "fourth boot");
    await b.watchPass();
    chain[SATURDAY] = live;
    say(7, `/watch ${SATURDAY}`);
    await until(() => to(7).length === 1, "watch 7");
    expect(b.state.chats["7"]!.circle).toBe(SATURDAY);
    sendFails[7] = 403;
    chain[SATURDAY] = edit(live, (c) => {
      c.members[3]!.paidThisRound = true;
      c.paidCount = 5n;
    });
    await b.watchPass();
    expect(b.state.chats["7"]).toBeUndefined();
    sendFails = {};
    await b.stop();
  });

  test("a long burst goes out as a few lines, not a flood", async () => {
    const b = boot();
    await until(() => b.ready(), "fifth boot");
    await b.watchPass();
    chain[SATURDAY] = live;
    say(9, `/watch ${SATURDAY}`);
    await until(() => to(9).length === 1, "watch 9");
    // many things at once, as after a long outage: everyone joins, the circle fills and every round passes
    const empty = edit(live, (c) => {
      c.start = 0n;
      c.round = 0n;
      c.paidCount = 0n;
      c.joined = 0n;
      c.members.forEach((m) => {
        m.member = "0x0000000000000000000000000000000000000000";
        m.paidThisRound = false;
      });
    });
    b.state.seen[SATURDAY] = stringify(empty);
    chain[SATURDAY] = edit(live, (c) => {
      c.round = 3n; // three payouts since the circle filled
      c.paidCount = 1n;
      c.members.forEach((m, i) => (m.paidThisRound = i === 0));
    });
    const before = to(9).length;
    await b.watchPass();
    const burst = to(9).slice(before);
    expect(burst).toHaveLength(5); // joined, started, three payouts and a payment: six events, five lines
    expect(burst[4]).toBe("Tolu collected round 3 of 5. Ngozi paid for round 4. 1 of 5 paid.");
    await b.stop();
  });

  test("the token never reaches a log, even when Telegram is unreachable", async () => {
    const dead = startTelegram({ token: TOKEN, reads, file: path.join(dir, "other.json"), log: (...a) => logs.push(a.join(" ")), api: "http://localhost:1", watchMs: 10_000_000 });
    await new Promise((r) => setTimeout(r, 400));
    await dead.stop();
    expect(logs.some((l) => l.includes("telegram start"))).toBe(true); // the failure was logged...
    expect(logs.filter((l) => l.includes("FAKE-TOKEN") || l.includes("123456"))).toEqual([]); // ...without the token
    expect(fs.readFileSync(file, "utf8")).not.toContain("FAKE-TOKEN");
  });
});
