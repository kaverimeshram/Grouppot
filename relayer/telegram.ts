// The grouppot Telegram bot. Long polling, no webhook, so it needs no public port. Started by server.ts only when
// TELEGRAM_BOT_TOKEN is set; the token is read once from the environment and never logged or echoed.
//   /watch <circle link or address>  this chat follows that circle     /circle  where it stands     /stop  unfollow
// A watched circle is read on every pass; diff() turns what changed into one short message per event.
import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import type { Snapshot } from "../web/lib/chain";
import { isDone, isStarted, num, openSlots, ZERO } from "../web/lib/circle-state";
import { diff, messages } from "./events";
import { circleUrl, previewLine } from "./share";
import { parse, stringify } from "./snapshot";
import { words } from "./words";

export type Reads = { isCircle(circle: Address): Promise<boolean>; snapshot(circle: Address): Promise<Snapshot> };
type State = { offset: number; chats: Record<string, { circle: Address; name: string }>; seen: Record<string, string> };
type Update = {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string };
  my_chat_member?: { chat: { id: number }; new_chat_member: { status: string } };
};
type Send = { chat: number; text: string; button?: Address };

const API = "https://api.telegram.org";

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly retryAfter?: number,
  ) {
    super(`${method} failed (${code})`);
  }
}

/// "/watch@grouppot_bot https://..." -> { command: "watch", arg: "https://..." }; null when the text is not a command.
export function parseCommand(text: string | undefined): { command: string; arg: string } | null {
  const m = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec((text ?? "").trim());
  return m ? { command: m[1]!.toLowerCase(), arg: (m[2] ?? "").trim() } : null;
}

/// The circle in a pasted link or bare address. An invite link's #k=... part is ignored and never stored.
export function circleIn(arg: string): Address | null {
  const m = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/.exec(arg);
  return m ? (m[0].toLowerCase() as Address) : null;
}

const MIN_GAP_MS = 1100; // Telegram allows about one message a second to a chat and 20 a minute to a group
const MAX_PER_PASS = 5;

export function startTelegram(opts: { token: string; reads: Reads; file: string; log: (...a: unknown[]) => void; api?: string; watchMs?: number; minGapMs?: number }) {
  const { token, reads, file, log } = opts;
  const api = opts.api ?? API;
  const state: State = fs.existsSync(file) ? { offset: 0, chats: {}, seen: {}, ...JSON.parse(fs.readFileSync(file, "utf8")) } : { offset: 0, chats: {}, seen: {} };
  let ready = false;
  let stopped = false;
  let polling: Promise<void> | undefined;

  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 1));
    fs.renameSync(`${file}.tmp`, file);
  };

  // The URL carries the token, so an error is rebuilt from the method name and Telegram's code, never from the request.
  async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const res = await fetch(`${api}/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }).catch((e: unknown) => {
      throw new TelegramError(method, e instanceof Error && e.name === "TimeoutError" ? 408 : 0);
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; parameters?: { retry_after?: number } } | null;
    if (!j?.ok) throw new TelegramError(method, j?.error_code ?? res.status, j?.parameters?.retry_after);
    return j.result as T;
  }

  // ---------- sending, one chat at a time, never faster than Telegram allows ----------

  const lanes = new Map<number, Promise<unknown>>();
  const lastSent = new Map<number, number>();
  function say(m: Send): Promise<void> {
    const run = async () => {
      const wait = (lastSent.get(m.chat) ?? 0) + (opts.minGapMs ?? MIN_GAP_MS) - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await call("sendMessage", {
            chat_id: m.chat,
            text: m.text,
            link_preview_options: { is_disabled: true },
            ...(m.button ? { reply_markup: { inline_keyboard: [[{ text: words.openCircle, url: circleUrl(m.button) }]] } } : {}),
          });
          lastSent.set(m.chat, Date.now());
          return;
        } catch (e) {
          if (e instanceof TelegramError && e.code === 429 && attempt === 0) await new Promise((r) => setTimeout(r, (e.retryAfter ?? 3) * 1000));
          else if (e instanceof TelegramError && (e.code === 403 || e.code === 400)) {
            // the bot was removed from the chat, or the chat is gone: stop following for it
            if (state.chats[String(m.chat)]) forget(m.chat);
            return;
          } else {
            log("telegram send", e instanceof Error ? e.message : "failed");
            return;
          }
        }
      }
    };
    const next = (lanes.get(m.chat) ?? Promise.resolve()).then(run, run);
    lanes.set(m.chat, next.catch(() => undefined));
    return next;
  }

  function forget(chat: number) {
    delete state.chats[String(chat)];
    const watched = new Set(Object.values(state.chats).map((c) => c.circle));
    for (const k of Object.keys(state.seen)) if (!watched.has(k as Address)) delete state.seen[k];
    save();
  }

  // ---------- commands ----------

  async function onMessage(chat: number, text: string | undefined) {
    const cmd = parseCommand(text);
    if (!cmd) return;
    const reply = (t: string, button?: Address) => say({ chat, text: t, button });
    if (cmd.command === "start") return void (await reply(words.bot.start));
    if (cmd.command === "stop") {
      if (!state.chats[String(chat)]) return void (await reply(words.bot.stoppedNothing));
      forget(chat);
      return void (await reply(words.bot.stopped));
    }
    if (cmd.command === "watch") {
      const circle = circleIn(cmd.arg);
      if (!circle) return void (await reply(cmd.arg ? words.bot.watchBad : words.bot.watchUsage));
      try {
        if (!(await reads.isCircle(circle))) return void (await reply(words.bot.watchBad));
        const snap = await reads.snapshot(circle);
        const had = state.chats[String(chat)];
        state.chats[String(chat)] = { circle, name: snap.name };
        // the baseline is now: what already happened is not announced
        if (!state.seen[circle]) state.seen[circle] = stringify(snap);
        if (had && had.circle !== circle) forget2(had.circle);
        save();
        return void (await reply(had && had.circle !== circle ? words.bot.watchSwitched(snap.name) : words.bot.watchOk(snap.name)));
      } catch (e) {
        log("telegram watch", e instanceof Error ? e.message : "failed");
        return void (await reply(words.bot.cantRead));
      }
    }
    if (cmd.command === "circle") {
      const watching = state.chats[String(chat)];
      if (!watching) return void (await reply(words.bot.notWatching));
      try {
        return void (await reply(circleText(await reads.snapshot(watching.circle)), watching.circle));
      } catch (e) {
        log("telegram circle", e instanceof Error ? e.message : "failed");
        return void (await reply(words.bot.cantRead));
      }
    }
  }

  /// Drop a baseline nobody follows any more.
  function forget2(circle: Address) {
    if (!Object.values(state.chats).some((c) => c.circle === circle)) delete state.seen[circle];
  }

  // ---------- events ----------

  // One pass at a time: a second caller shares the pass already running instead of announcing the same change twice.
  let running: Promise<void> | null = null;
  const watchPass = () => (running ??= pass().finally(() => (running = null)));

  async function pass() {
    const circles = [...new Set(Object.values(state.chats).map((c) => c.circle))];
    for (const circle of circles) {
      let cur: Snapshot;
      try {
        cur = await reads.snapshot(circle);
      } catch (e) {
        log("telegram read", circle, e instanceof Error ? e.message : "failed");
        continue;
      }
      const before = state.seen[circle];
      if (before) {
        const found = messages(diff(parse(before), cur), cur);
        // a long burst (a restart after downtime) goes out as a few lines, not a flood
        const lines = found.length > MAX_PER_PASS ? [...found.slice(0, MAX_PER_PASS - 1), found.slice(MAX_PER_PASS - 1).join(" ")] : found;
        const chats = Object.entries(state.chats).filter(([, c]) => c.circle === circle).map(([id]) => Number(id));
        await Promise.all(chats.flatMap((chat) => lines.map((text) => say({ chat, text }))));
      }
      // remembered after the messages are sent, so a crash in between repeats a line rather than losing one
      state.seen[circle] = stringify(cur);
      save();
    }
  }

  // ---------- loops ----------

  async function poll() {
    while (!stopped) {
      try {
        const updates = await call<Update[]>("getUpdates", { offset: state.offset, timeout: 25, allowed_updates: ["message", "my_chat_member"] }, 40_000);
        for (const u of updates) {
          state.offset = u.update_id + 1;
          if (u.my_chat_member && ["left", "kicked"].includes(u.my_chat_member.new_chat_member.status)) forget(u.my_chat_member.chat.id);
          if (u.message) await onMessage(u.message.chat.id, u.message.text).catch((e) => log("telegram command", e instanceof Error ? e.message : "failed"));
        }
        if (updates.length) save();
      } catch (e) {
        log("telegram poll", e instanceof Error ? e.message : "failed");
        await new Promise((r) => setTimeout(r, e instanceof TelegramError && e.retryAfter ? e.retryAfter * 1000 : 5000));
      }
    }
  }

  (async () => {
    for (;;) {
      try {
        const me = await call<{ username?: string }>("getMe", {});
        await call("setMyCommands", { commands: Object.entries(words.bot.commands).map(([command, description]) => ({ command, description })) }).catch(() => undefined);
        ready = true;
        log(`telegram bot @${me.username ?? "?"} polling, ${Object.keys(state.chats).length} chats`);
        break;
      } catch (e) {
        log("telegram start", e instanceof Error ? e.message : "failed");
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    polling = poll();
    const tick = async () => {
      await watchPass().catch((e) => log("telegram pass", e instanceof Error ? e.message : "failed"));
      if (!stopped) setTimeout(tick, opts.watchMs ?? 15_000);
    };
    void tick();
  })();

  /// Stops after the poll in flight returns, so no update is read by a bot that is no longer listening.
  const stop = async () => {
    stopped = true;
    await polling;
  };
  return { ready: () => ready, stop, watchPass, state };
}

/// What /circle replies with: the page's rules, a day where the page shows a clock, who has paid and who has not.
export function circleText(s: Snapshot): string {
  const now = Math.floor(Date.now() / 1000);
  const lines = [isDone(s) ? words.bot.circleDone(s.name) : words.bot.circleHead(s.name, num(s.round) + 1, num(s.size)), words.bot.sentence(previewLine(s, now))];
  const people = s.members.filter((m) => m.member !== ZERO);
  if (isStarted(s) && !isDone(s)) {
    lines.push(words.bot.paidLine(people.filter((m) => m.paidThisRound).map((m) => m.label)));
    lines.push(words.bot.notYetLine(people.filter((m) => !m.paidThisRound).map((m) => m.label)));
  } else if (!isStarted(s)) lines.push(words.bot.openSpots(openSlots(s).length));
  return lines.join("\n");
}
