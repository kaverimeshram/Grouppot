// Reads a circle from Monad testnet: round, guarantee, each member's balance and set-aside. Usage: bun run demo/read-circle.ts <circle>
import { readCircle, balanceOf, dollars } from "../web/lib/chain";
const v = await readCircle((process.argv[2] ?? "0xab6ca6f64e058b5c991869264c89e19bc2ff0989") as `0x${string}`);
console.log(`${v.name}: round ${v.round}/${v.size} paid ${v.paidCount} guarantee ${dollars(v.bond)} circle ${dollars(v.balance)}`);
for (const m of v.members) console.log(" ", m.label, "wallet", dollars(await balanceOf(m.member)), "defaults", m.defaults, "setAside", dollars(m.reserveBal));
console.log("  organiser", dollars(await balanceOf(v.organiser)));
