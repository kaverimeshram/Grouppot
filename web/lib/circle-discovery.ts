import type { Address, ContractFunctionParameters } from "viem";
import { circleAbi, factoryAbi } from "./abi";
import { FACTORIES, publicClient, type Snapshot } from "./chain";

const MAX_CIRCLES = 500n;
const READ_BATCH = 25;
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11" as Address;
const ZERO = "0x0000000000000000000000000000000000000000";

async function indexedCircles(): Promise<Address[]> {
  const circles: Address[] = [];
  for (const factory of FACTORIES) {
    const count = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "count" });
    if (BigInt(circles.length) + count > MAX_CIRCLES) throw new Error("Circle list is larger than this recovery check can safely scan.");
    if (count) circles.push(...await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "page", args: [0n, count] }));
  }
  return circles;
}

export function isCircleMember(snapshot: Snapshot, owner: Address): boolean {
  return snapshot.organiser.toLowerCase() === owner.toLowerCase() || snapshot.members.some(
    (member) => member.member !== ZERO && member.member.toLowerCase() === owner.toLowerCase(),
  );
}

export async function discoverCircles(owner: Address, local: Address[] = []): Promise<{ address: Address; name: string }[]> {
  const indexed = await indexedCircles();
  const indexedSet = new Set(indexed.map((address) => address.toLowerCase()));
  const addresses = [...new Map([...local.filter((address) => indexedSet.has(address.toLowerCase())), ...indexed].map((address) => [address.toLowerCase(), address])).values()];
  const found: { address: Address; name: string }[] = [];

  for (let from = 0; from < addresses.length; from += READ_BATCH) {
    const batch = addresses.slice(from, from + READ_BATCH);
    const contracts: ContractFunctionParameters<typeof circleAbi, "view", "snapshot">[] = batch.map((address) => ({
      address,
      abi: circleAbi,
      functionName: "snapshot",
    }));
    const snapshots = await publicClient.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: false,
      contracts,
    }) as unknown as Snapshot[];
    snapshots.forEach((snapshot, i) => {
      if (isCircleMember(snapshot, owner)) found.push({ address: batch[i]!, name: snapshot.name });
    });
  }

  return found;
}
