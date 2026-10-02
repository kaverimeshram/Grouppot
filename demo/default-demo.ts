// A live default on Monad testnet, for the demo and to exercise the Covered and Stopped states:
// 4 members, $1 every 10 minutes, a $1 guarantee. After round 1 pays, the last member empties her balance (back to the
// relayer's practice treasury). Round 2: her set-aside covers her. Round 3: the guarantee covers her. Round 4 (hers):
// her payout repays the guarantee first. Everyone else ends whole; read back from chain at each step.
// Usage: RELAYER=https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot bun run demo/default-demo.ts
import fs from "node:fs";
import path from "node:path";
import { createWalletClient, erc20Abi, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { balanceOf, bondBundle, chain, dollars, joinBundle, newInviteKey, readCircle, relay, toUnits, TOKEN, RPC } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot";
const TREASURY = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "../deployments/testnet.json"), "utf8")).relayer as Address;
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const run = `default-${Date.now().toString(36)}`;
const key = (l: string) => (wallets[`${run}-${l}`] ??= generatePrivateKey());
const names = ["Funmi", "Chidi", "Yemi", "Bisi"];
const members = names.map((n) => ({ name: n, account: privateKeyToAccount(key(n)) }));
const org = members[0]!.account;
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const C = toUnits(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (s: string, x: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString().slice(11, 19), step: s, ...x }));
async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 30 * 60_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(10_000)) {
    const v = await read();
    if (ok(v)) return v;
  }
  throw new Error("timed out");
}

const invite = newInviteKey();
const created = await relay("create", { name: "Practice: when someone stops", labels: names, contribution: C.toString(), period: 600, organiser: org.address, inviteSigner: invite.signer }, BASE);
const circle = created.circle as Address;
step("created", { circle, hash: created.hash });
for (const [slot, m] of members.entries()) {
  await relay("practice", { address: m.account.address, circle, ...(slot === 0 ? { bond: C.toString() } : {}) }, BASE);
  await until(() => balanceOf(m.account.address), (b) => b > 0n, 60_000);
  if (slot === 0) step("guarantee", { hash: (await relay("bond", await bondBundle(org, circle, C), BASE)).hash });
  step("joined", { name: m.name, hash: (await relay("join", await joinBundle(m.account, invite.key, await readCircle(circle), slot), BASE)).hash });
}
await until(() => readCircle(circle), (v) => v.round >= 1n);
step("round 1 paid on fill");

const bisi = members[3]!.account;
const w = createWalletClient({ account: bisi, chain, transport: http(RPC) });
const left = await balanceOf(bisi.address);
const back = await w.writeContract({ address: TOKEN, abi: erc20Abi, functionName: "transfer", args: [TREASURY, left] });
step("Bisi stops paying: balance moved out", { amount: dollars(left), hash: back });

let v = await until(() => readCircle(circle), (x) => x.round >= 2n);
step("round 2 paid", { bisi: { defaults: Number(v.members[3]!.defaults), setAside: dollars(v.members[3]!.reserveBal) }, guarantee: dollars(v.bond) });
if (v.members[3]!.defaults !== 1n || v.members[3]!.reserveBal !== 0n) throw new Error("round 2: set-aside did not cover");
v = await until(() => readCircle(circle), (x) => x.round >= 3n);
step("round 3 paid", { bisi: { defaults: Number(v.members[3]!.defaults), owes: dollars(v.members[3]!.owes) }, guarantee: dollars(v.bond) });
if (v.bond !== 0n || v.members[3]!.owes !== C) throw new Error("round 3: guarantee did not cover");
v = await until(() => readCircle(circle), (x) => x.round >= 4n && x.balance === 0n);
step("closed", { guaranteeBackToOrganiser: true, owes: dollars(v.members[3]!.owes) });
for (const m of members) step("final", { name: m.name, balance: dollars(await balanceOf(m.account.address)) });
