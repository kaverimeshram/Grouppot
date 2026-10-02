// Exits 1 unless a circle reached a state read from chain. Used by the progress ledger as acceptance criteria.
//   bun run demo/check-circle.ts closed <circle>        every round paid, nothing left in the circle, no defaults
//   bun run demo/check-circle.ts paid-round <circle> <n> at least n rounds paid out, all members seated
import { type Address } from "viem";
import { readCircle } from "../web/lib/chain";

const [mode, circle, n] = process.argv.slice(2) as [string, Address, string?];
const v = await readCircle(circle);
const seated = v.members.every((m) => !/^0x0{40}$/.test(m.member));
const ok =
  mode === "closed"
    ? v.round === v.size && v.balance === 0n && v.members.every((m) => m.defaults === 0n)
    : mode === "paid-round"
      ? seated && v.round >= BigInt(n ?? "1")
      : false;
console.log(`${v.name}: ${mode} round ${v.round}/${v.size} balance ${v.balance} seated ${seated} -> ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
