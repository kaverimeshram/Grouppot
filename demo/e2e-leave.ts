// Leaving before a circle fills, end to end on Monad testnet through the live relayer: the organiser posts a guarantee
// and takes it back; a member joins and leaves; both get exactly what they put in, and the place opens again.
// Usage: RELAYER=https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot bun run demo/e2e-leave.ts
import fs from "node:fs";
import path from "node:path";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { balanceOf, bondBundle, dollars, joinBundle, leaveBundle, newInviteKey, readCircle, relay, toUnits, unbondBundle } from "../web/lib/chain";

const BASE = process.env.RELAYER ?? "https://teslas-mac-mini.tail57f771.ts.net:10000/grouppot";
const walletsFile = path.join(import.meta.dir, ".wallets.json");
const wallets: Record<string, Hex> = fs.existsSync(walletsFile) ? JSON.parse(fs.readFileSync(walletsFile, "utf8")) : {};
const run = `leave-${Date.now().toString(36)}`;
const acct = (l: string) => privateKeyToAccount((wallets[`${run}-${l}`] ??= generatePrivateKey()));
const org = acct("organiser");
const member = acct("member");
const invite = newInviteKey();
wallets[`${run}-invite`] = invite.key;
fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 1), { mode: 0o600 });
const C = toUnits(1);
const step = (s: string, x: Record<string, unknown> = {}) => console.log(JSON.stringify({ step: s, ...x }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function funded(who: Address) {
  for (let i = 0; i < 30; i++, await sleep(2000)) if ((await balanceOf(who)) > 0n) return balanceOf(who);
  throw new Error("not funded");
}

const circle = (await relay("create", { name: "Leave check", labels: ["One", "Two", "Three", "Four"], contribution: C.toString(), period: 600, organiser: org.address, inviteSigner: invite.signer }, BASE)).circle as Address;
step("created", { circle });

await relay("practice", { address: org.address, circle, bond: C.toString() }, BASE);
const orgHad = await funded(org.address);
step("guarantee posted", { hash: (await relay("bond", await bondBundle(org, circle, C), BASE)).hash });
if ((await readCircle(circle)).bond !== C) throw new Error("guarantee not on chain");
step("guarantee taken back", { hash: (await relay("unbond", await unbondBundle(org, circle), BASE)).hash });
const afterUnbond = await readCircle(circle);
if (afterUnbond.bond !== 0n || (await balanceOf(org.address)) !== orgHad) throw new Error("guarantee not returned whole");
step("organiser whole", { balance: dollars(orgHad) });

await relay("practice", { address: member.address, circle }, BASE);
const had = await funded(member.address);
step("joined", { hash: (await relay("join", await joinBundle(member, invite.key, await readCircle(circle), 1), BASE)).hash });
const mid = await readCircle(circle);
if (mid.members[1]!.member !== member.address || (await balanceOf(member.address)) !== had - 2n * C) throw new Error("join not as expected");
step("left", { hash: (await relay("leave", await leaveBundle(member, circle), BASE)).hash });
const end = await readCircle(circle);
if ((await balanceOf(member.address)) !== had || !/^0x0{40}$/.test(end.members[1]!.member) || end.joined !== 0n || end.balance !== 0n) {
  throw new Error("leave did not refund in full or reopen the place");
}
step("member whole, place open, circle holds nothing", { balance: dollars(had), circleHolds: dollars(end.balance) });
