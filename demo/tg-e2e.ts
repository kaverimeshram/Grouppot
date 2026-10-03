// Drives a real practice circle so the Telegram bot has events to post: creates it, writes its address to
// /tmp/gp-tg-circle, waits for /tmp/gp-tg-go (the tester has /watch-ed it), then seats 3 members and lets the keeper run
// every round. Script keys stand in for passkeys (demo/.wallets.json, gitignored).
// Usage: RELAYER=https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot bun run demo/tg-e2e.ts
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { balanceOf, joinBundle, newInviteKey, readCircle, relay, toUnits } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot";
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const run = `tg-${Date.now().toString(36)}`;
const names = ["Ife", "Jide", "Kunle"];
const members = names.map((n) => ({ n, a: privateKeyToAccount((wallets[`${run}-${n}`] ??= generatePrivateKey())) }));
const invite = newInviteKey();
wallets[`${run}-invite`] = invite.key;
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (s: string, x: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString().slice(11, 19), step: s, ...x }));

const circle = (await relay("create", { name: "Telegram check", labels: names, contribution: toUnits(1).toString(), period: 600, organiser: members[0]!.a.address, inviteSigner: invite.signer }, BASE)).circle as Address;
fs.writeFileSync("/tmp/gp-tg-circle", circle);
log("created, waiting for /watch", { circle });
while (!fs.existsSync("/tmp/gp-tg-go")) await sleep(2000);
for (const [slot, m] of members.entries()) {
  await relay("practice", { address: m.a.address, circle }, BASE);
  for (let i = 0; i < 30 && (await balanceOf(m.a.address)) === 0n; i++) await sleep(2000);
  log("joined", { name: m.n, hash: (await relay("join", await joinBundle(m.a, invite.key, await readCircle(circle), slot), BASE)).hash });
  await sleep(20_000); // one event per bot poll, so each join posts on its own
}
for (;;) {
  const v = await readCircle(circle);
  if (v.round === v.size && v.balance === 0n) break;
  await sleep(15_000);
}
log("closed", { circle });
