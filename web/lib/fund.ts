import type { Address } from "viem";
import { balanceOf, relay } from "./chain";
import { Plain } from "./errors";
import { copy } from "./copy";
import { until } from "./poll";

/// Practice dollars, as the relayer grants them per circle: round 1, the set-aside and every later round.
export const practiceAmount = (contribution: bigint, size: bigint): bigint => (size + 1n) * contribution;

/// Adds practice dollars once, then waits until the balance shows them. Returns the new balance.
/// The organiser passes her guarantee so one grant covers her place in the circle and the guarantee.
export async function addPracticeDollars(who: Address, circle: Address, bond?: bigint): Promise<bigint> {
  const before = await balanceOf(who);
  await relay("practice", { address: who, circle, ...(bond !== undefined ? { bond: bond.toString() } : {}) });
  const got = await until(() => balanceOf(who), (b) => b > before, 2000, 60_000);
  if (got === null) throw new Plain(copy.error.slowFunds);
  return got;
}
