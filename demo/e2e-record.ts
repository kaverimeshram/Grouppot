// Payment record and kept places, end to end on Monad testnet through the live relayer:
//   A. a 3-person circle ($1, every 10 minutes) finishes cleanly; each member's record reads 3 paid, none missed.
//   B. a circle keeps its first place for members with 3 rounds paid and none missed: a newcomer is refused that place,
//      a member from circle A takes it, another newcomer joins and leaves again with everything back.
// Script keys stand in for passkeys (same signing code as the app) and live in demo/.wallets.json (gitignored).
// Usage: RELAYER=https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot bun run demo/e2e-record.ts
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { balanceOf, dollars, joinBundle, leaveBundle, newInviteKey, readCircle, readRecord, relay, toUnits } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot";
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const run = `record-${Date.now().toString(36)}`;
const acct = (l: string) => privateKeyToAccount((wallets[`${run}-${l}`] ??= generatePrivateKey()));
const save = () => fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const C = toUnits(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string, x: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString().slice(11, 19), step: s, ...x }));
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 40 * 60_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(10_000)) {
    const v = await read();
    if (ok(v)) return v;
  }
  throw new Error("timed out");
}
async function fundAndJoin(a: PrivateKeyAccount, circle: Address, inviteKey: Hex, slot: number) {
  await relay("practice", { address: a.address, circle }, BASE);
  await until(() => balanceOf(a.address), (b) => b > 0n, 60_000);
  return relay("join", await joinBundle(a, inviteKey, await readCircle(circle), slot), BASE);
}

// ---------- A: a clean circle builds a record ----------
const A = ["Amaka", "Bola", "Chinedu"].map((n) => ({ n, a: acct(n) }));
save();
const invA = newInviteKey();
wallets[`${run}-inviteA`] = invA.key;
save();
const a = (await relay("create", { name: "Record builder", labels: A.map((x) => x.n), contribution: C.toString(), period: 600, organiser: A[0]!.a.address, inviteSigner: invA.signer }, BASE)).circle as Address;
step("A created", { circle: a });
for (const [slot, m] of A.entries()) step("A joined", { name: m.n, hash: (await fundAndJoin(m.a, a, invA.key, slot)).hash });
await until(() => readCircle(a), (v) => v.round === 3n && v.balance === 0n);
for (const m of A) {
  const r = await readRecord(m.a.address);
  step("A record", { name: m.n, ...r });
  if (r.paid !== 3 || r.missed !== 0 || r.finishedClean !== 1) throw new Error(`${m.n}: record ${JSON.stringify(r)}`);
}

// ---------- B: the first place is kept for proven members ----------
const newcomer = acct("Dayo");
const leaver = acct("Efe");
save();
const invB = newInviteKey();
wallets[`${run}-inviteB`] = invB.key;
save();
const b = (await relay("create", { name: "Proven first", labels: ["First", "Second", "Third"], contribution: C.toString(), period: 600, earlySlots: 1, minPaid: 3, organiser: A[0]!.a.address, inviteSigner: invB.signer }, BASE)).circle as Address;
step("B created, first place kept for 3 paid and none missed", { circle: b });

await relay("practice", { address: newcomer.address, circle: b }, BASE);
await until(() => balanceOf(newcomer.address), (x) => x > 0n, 60_000);
const before = await balanceOf(newcomer.address);
const refused = await relay("join", await joinBundle(newcomer, invB.key, await readCircle(b), 0), BASE).then(
  () => null,
  (e: Error) => e.message,
);
if (!refused || !/record/i.test(refused)) throw new Error(`newcomer was not refused the kept place: ${refused}`);
if ((await balanceOf(newcomer.address)) !== before) throw new Error("a refused join moved money");
step("newcomer refused the kept place, nothing charged", { reason: refused });

step("proven member takes the kept place", { hash: (await relay("join", await joinBundle(A[1]!.a, invB.key, await readCircle(b), 0), BASE)).hash });
step("newcomer takes an open place", { hash: (await relay("join", await joinBundle(newcomer, invB.key, await readCircle(b), 1), BASE)).hash });

await relay("practice", { address: leaver.address, circle: b }, BASE);
await until(() => balanceOf(leaver.address), (x) => x > 0n, 60_000);
const had = await balanceOf(leaver.address);
step("Efe joins", { hash: (await relay("join", await joinBundle(leaver, invB.key, await readCircle(b), 2), BASE)).hash });
const left = await relay("leave", await leaveBundle(leaver, b), BASE);
const vb = await readCircle(b);
if ((await balanceOf(leaver.address)) !== had || !/^0x0{40}$/.test(vb.members[2]!.member)) throw new Error("leave did not refund or reopen the place");
step("Efe left before the circle filled: everything back, place open", { hash: left.hash, balance: dollars(had) });

// ---------- leave B unfilled cleanly: the two seated members take their money back ----------
for (const x of [A[1]!.a, newcomer]) {
  const had2 = await balanceOf(x.address);
  await relay("leave", await leaveBundle(x, b), BASE);
  step("left B", { member: x.address, refunded: dollars((await balanceOf(x.address)) - had2) });
}
const empty = await readCircle(b);
if (empty.joined !== 0n || empty.balance !== 0n) throw new Error("B still holds money");
step("done", { circleA: a, circleB: b, bHolds: dollars(empty.balance) });
