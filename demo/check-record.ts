// Exits 1 unless a member's payment record on the current factory equals the expected numbers.
// Usage: bun run demo/check-record.ts <member> <paid> <missed> <finishedClean>
import { type Address } from "viem";
import { readRecord } from "../web/lib/chain";
const [who, paid, missed, clean] = process.argv.slice(2);
const r = await readRecord(who as Address);
const ok = r.paid === Number(paid) && r.missed === Number(missed) && r.finishedClean === Number(clean);
console.log(`${who}: ${JSON.stringify(r)} -> ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
