// Seeds the judges' demo circle on Monad testnet through the live relayer: "Saturday Ajo", 5 members, $2 a week,
// a $4 guarantee. It fills (round 0 pays Ngozi on the spot) and 4 of 5 members pay round 1 early, so the circle page
// shows a ring 4/5 full, Ada collecting at the due date, and Bisi not yet paid. Every step is read back from chain.
// Member keys stand in for passkeys and live in demo/.wallets.json (gitignored, never printed).
// Usage: RELAYER=https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot bun run demo/seed-testnet.ts
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { balanceOf, bondBundle, contributeBundle, dollars, joinBundle, newInviteKey, readCircle, relay, toUnits } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot";
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const keyFor = (label: string) => (wallets[`seed-${label}`] ??= generatePrivateKey());
const names = ["Ngozi", "Ada", "Tolu", "Bisi", "Kemi"];
const members = names.map((n) => ({ name: n, account: privateKeyToAccount(keyFor(n)) }));
const org = members[0]!.account; // the organiser is in her own circle, first in the order
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const C = toUnits(2);
const step = (s: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ step: s, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function funded(who: Address) {
  for (let i = 0; i < 30; i++) {
    const b = await balanceOf(who);
    if (b > 0n) return b;
    await sleep(2000);
  }
  throw new Error(`no balance for ${who}`);
}

const invite = newInviteKey();
const created = await relay("create", { name: "Saturday Ajo", labels: names, contribution: C.toString(), period: 604_800, organiser: org.address, inviteSigner: invite.signer }, BASE);
const circle = created.circle as Address;
step("created", { circle, hash: created.hash });

for (const [slot, m] of members.entries()) {
  const p = await relay("practice", { address: m.account.address, circle }, BASE);
  await funded(m.account.address);
  if (slot === 0) {
    const b = await relay("bond", await bondBundle(org, circle, 2n * C), BASE);
    step("guarantee", { hash: b.hash, practice: p.hash });
  }
  const j = await relay("join", await joinBundle(m.account, invite.key, await readCircle(circle), slot), BASE);
  step("joined", { name: m.name, hash: j.hash });
}
let v = await readCircle(circle);
for (let i = 0; i < 20 && v.round === 0n; i++) {
  await sleep(5000);
  v = await readCircle(circle);
}
if (v.round !== 1n) throw new Error("round 0 did not pay out");
step("round 0 paid on fill", { to: "Ngozi" });

for (const m of members.filter((x) => x.name !== "Bisi")) {
  const c = await relay("contribute", await contributeBundle(m.account, await readCircle(circle)), BASE);
  step("paid round 1 early", { name: m.name, hash: c.hash });
}
v = await readCircle(circle);
if (v.paidCount !== 4n) throw new Error(`expected 4 of 5 paid, read ${v.paidCount}`);
step("seeded", { circle, round: Number(v.round), paid: `${v.paidCount} of ${v.size}`, guarantee: dollars(v.bond), due: new Date(Number(v.dueAt) * 1000).toISOString() });
fs.writeFileSync(path.join(import.meta.dir, "DEMO.md"), `# grouppot demo circle (Monad testnet)\n\nSaturday Ajo: ${circle}\nCircle page: /c/?id=${circle}\nInvite key: kept in demo/.wallets.json as seed-invite (the circle is full, so it admits nobody).\nState at seeding: round 2 of 5, 4 of 5 paid, Ada collects ${new Date(Number(v.dueAt) * 1000).toUTCString()}.\n`);
wallets["seed-invite"] = invite.key;
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
