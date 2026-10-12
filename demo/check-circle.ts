// Exits 1 unless a circle reached a state read from chain. Used by the progress ledger as acceptance criteria.
//   bun run demo/check-circle.ts closed <circle>        every round paid, nothing left in the circle, no defaults
//   bun run demo/check-circle.ts paid-round <circle> <n> at least n rounds paid out, all members seated
//   bun run demo/check-circle.ts record <circle> <n>     made by the current factory, round 1 paid out, every member seated with at least n rounds paid and none missed
import { type Address } from "viem";
import { factoryAbi } from "../web/lib/abi";
import { FACTORY, publicClient, readCircle, readRecord } from "../web/lib/chain";

const [mode, circle, n] = process.argv.slice(2) as [string, Address, string?];
const v = await readCircle(circle);
const seated = v.members.every((m) => !/^0x0{40}$/.test(m.member));
const current = mode === "record" ? await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isCircle", args: [circle] }) : false;
const records = mode === "record" ? await Promise.all(v.members.map((m) => readRecord(m.member))) : [];
if (mode === "record") console.log(records.map((r, i) => `${v.members[i]!.label} ${r.paid} paid ${r.missed} missed`).join(", "));
const ok =
  mode === "record"
    ? current && seated && v.round >= 1n && records.length === v.members.length && records.every((r) => r.paid >= Number(n ?? "1") && r.missed === 0)
    : mode === "closed"
    ? v.round === v.size && v.balance === 0n && v.members.every((m) => m.defaults === 0n)
    : mode === "paid-round"
      ? seated && v.round >= BigInt(n ?? "1")
      : false;
console.log(`${v.name}: ${mode} round ${v.round}/${v.size} balance ${v.balance} seated ${seated} -> ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
