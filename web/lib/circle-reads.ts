// Reads the circle snapshot does not carry. Circles from the first two factories have no leave, guarantee exit or
// early-slot functions at all; the page hides those controls for them instead of offering a button that cannot work.
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, type Address } from "viem";
import { circleAbi } from "./abi";
import { publicClient, readEarlySlots, readRecord, type PaymentRecord } from "./chain";

const NOBODY = "0x0000000000000000000000000000000000000000";

/// Whether the circle answered a read at all. A circle that predates the function answers with no data or a revert;
/// any other failure (network) is thrown so the caller does not mistake an outage for "old circle".
async function answered(read: Promise<unknown>): Promise<boolean> {
  try {
    await read;
    return true;
  } catch (e) {
    if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionZeroDataError || x instanceof ContractFunctionRevertedError) instanceof Error) return false;
    throw e;
  }
}

/// True when this circle has the leave and guarantee-exit functions.
export const hasExit = (circle: Address) => answered(publicClient.readContract({ address: circle, abi: circleAbi, functionName: "joins", args: [NOBODY] }));

/// True when this circle reports to the factory's payment record. Earlier circles never wrote to it, so a record line
/// on one would read "New here" beside rounds the page shows were paid.
export const keepsRecord = (circle: Address) => answered(publicClient.readContract({ address: circle, abi: circleAbi, functionName: "record" }));

/// Records for each address, keyed by lower-case address. A member whose read fails is left out, never guessed.
export async function readRecords(members: Address[]): Promise<Record<string, PaymentRecord>> {
  const got = await Promise.all(members.map((m) => readRecord(m).then((r) => [m.toLowerCase(), r] as const, () => null)));
  return Object.fromEntries(got.filter((g) => g !== null));
}
