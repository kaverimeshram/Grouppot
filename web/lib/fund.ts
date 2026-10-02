import type { Address } from "viem";
import { balanceOf, relay } from "./chain";
import { Plain } from "./errors";
import { copy } from "./copy";
import { until } from "./poll";

/// Practice dollars, as the relayer grants them: round 1, the set-aside and every later round, capped at $60.
export const PRACTICE_CAP = 60_000_000n;
export const practiceAmount = (contribution: bigint, size: bigint): bigint => {
  const want = (size + 1n) * contribution;
  return want > PRACTICE_CAP ? PRACTICE_CAP : want;
};

/// Adds practice dollars once, then waits until the balance shows them. Returns the new balance.
export async function addPracticeDollars(who: Address, circle?: Address): Promise<bigint> {
  const before = await balanceOf(who);
  await relay("practice", { address: who, ...(circle ? { circle } : {}) });
  const got = await until(() => balanceOf(who), (b) => b > before, 2000, 60_000);
  if (got === null) throw new Plain(copy.error.slowFunds);
  return got;
}
