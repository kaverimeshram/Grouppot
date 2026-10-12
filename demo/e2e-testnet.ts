// End to end on Monad testnet through the real relayer API and the app's own signing code:
// organiser creates a circle, posts a guarantee, every member gets practice dollars and joins with one signature set,
// then the keeper pulls each round and pays out on schedule. Each step is read back from chain.
// Member keys stand in for Mera passkeys (same LocalAccount interface); they live in demo/.wallets.json (gitignored).
// Usage: RELAYER=http://localhost:3411 bun run demo/e2e-testnet.ts [members=3] [dollars=2] [period=600]
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { balanceOf, bondBundle, dollars, joinBundle, newInviteKey, readCircle, relay, toUnits } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "http://localhost:3411";
const [N = 3, USD = 2, PERIOD = 600] = process.argv.slice(2).map(Number);
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const names = ["Ngozi", "Ada", "Tolu", "Bisi", "Kemi", "Femi"];
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const run = Date.now().toString(36);
const keyFor = (label: string) => (wallets[`${run}-${label}`] ??= generatePrivateKey());
const org = privateKeyToAccount(keyFor("organiser"));
const members = names.slice(0, N).map((n) => ({ name: n, account: privateKeyToAccount(keyFor(n)) }));
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const step = (s: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString().slice(11, 19), step: s, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const C = toUnits(USD);

async function waitFor<T>(what: string, read: () => Promise<T>, ok: (v: T) => boolean, ms = 30 * 60_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(10_000);
  }
}

// 1. organiser: create the circle, get its practice dollars, post the guarantee
const invite = newInviteKey();
const created = await relay("create", { name: `Practice Ajo ${run}`, labels: members.map((m) => m.name), contribution: C.toString(), period: PERIOD, organiser: org.address, inviteSigner: invite.signer }, BASE);
const circle = created.circle as Address;
step("circle created", { circle, hash: created.hash });
const p0 = await relay("practice", { address: org.address, circle }, BASE);
await waitFor("organiser funded", () => balanceOf(org.address), (b) => b > 0n);
step("organiser practice dollars", { hash: p0.hash });
const bond = await relay("bond", await bondBundle(org, circle, C), BASE);
const afterBond = await readCircle(circle);
if (afterBond.bond !== C) throw new Error(`guarantee not on chain: ${afterBond.bond}`);
step("guarantee posted", { hash: bond.hash, guarantee: dollars(afterBond.bond) });

// 2. members: practice dollars for this circle, then join from the invite
for (const [slot, m] of members.entries()) {
  const p = await relay("practice", { address: m.account.address, circle }, BASE);
  const funded = await waitFor(`${m.name} funded`, () => balanceOf(m.account.address), (b) => b > 0n);
  const before = await readCircle(circle);
  const j = await relay("join", await joinBundle(m.account, invite.key, before, slot), BASE);
  const after = await readCircle(circle);
  if (after.members[slot]!.member !== m.account.address) throw new Error(`${m.name} not seated`);
  step("joined", { name: m.name, slot, practice: p.hash, join: j.hash, wallet: `${dollars(funded)} -> ${dollars(await balanceOf(m.account.address))}` });
}
const started = await readCircle(circle);
if (started.start === 0n) throw new Error("circle did not start when full");
step("circle full and started", { start: Number(started.start) });

// 3. every round: the keeper pulls standing orders and pays out; check the collector's balance moved by the pot
for (let r = 0; r < N; r++) {
  const collector = members[r]!;
  const before = await balanceOf(collector.account.address);
  const done = await waitFor(`round ${r} payout`, () => readCircle(circle), (v) => v.round > BigInt(r));
  const after = await balanceOf(collector.account.address);
  const expected = BigInt(N) * C - (r > 0 ? C : 0n); // pot, less this round's own standing order pulled from them
  if (after - before !== expected) throw new Error(`round ${r}: ${collector.name} moved ${dollars(after - before)}, expected ${dollars(expected)}`);
  step("payout landed", { round: r, collector: collector.name, received: dollars(after - before), circleBalance: dollars(done.balance) });
}

// 4. after the last round the keeper returns set-asides and the guarantee
const end = await waitFor("set-asides returned", () => readCircle(circle), (v) => v.balance === 0n);
for (const m of members) {
  const bal = await balanceOf(m.account.address);
  step("member final", { name: m.name, wallet: dollars(bal) });
}
step("circle closed", { circle, balance: dollars(end.balance), organiser: dollars(await balanceOf(org.address)) });
