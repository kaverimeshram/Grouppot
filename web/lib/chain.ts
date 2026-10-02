// Everything grouppot does on chain, for the browser and for scripts: reads come straight from the public RPC, writes
// are signatures handed to the relayer (/api), which pays the gas. A member never holds or spends MON.
import {
  createPublicClient,
  encodeAbiParameters,
  erc20Abi,
  hexToSignature,
  http,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { circleAbi, factoryAbi } from "./abi";
import { DEPLOYMENT, EARLIER_FACTORIES } from "./deployment";

export const RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://testnet-rpc.monad.xyz";
export const chain = {
  id: DEPLOYMENT.chainId,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;
export const FACTORY = DEPLOYMENT.factory as Address;
export const TOKEN = DEPLOYMENT.token as Address;
/// AUSD's EIP-712 domain, read from eip712Domain() on chain; chain.test.ts asserts it hashes to DOMAIN_SEPARATOR().
export const TOKEN_DOMAIN = { name: "Agora Dollar", version: "1", chainId: DEPLOYMENT.chainId, verifyingContract: TOKEN } as const;
export const DECIMALS = 6;
const MAX = 2n ** 256n - 1n;
const JOIN = MAX;

export const publicClient = createPublicClient({ chain, transport: http(RPC, { retryCount: 4, retryDelay: 400 }) });

export type Sig = { v: number; r: Hex; s: Hex };
export type Snapshot = Awaited<ReturnType<typeof readCircle>>;

// ---------- money as people say it ----------

export function toUnits(dollars: number): bigint {
  return BigInt(Math.round(dollars * 10 ** DECIMALS));
}

export function dollars(units: bigint): string {
  const cents = Number(units / 10n ** BigInt(DECIMALS - 2));
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toFixed(2)}`;
}

// ---------- reads ----------

export async function readCircle(circle: Address) {
  const v = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "snapshot" });
  return { ...v, address: circle };
}

export async function balanceOf(who: Address): Promise<bigint> {
  return publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [who] });
}

export const FACTORIES = [FACTORY, ...(EARLIER_FACTORIES as readonly Address[])];

export async function isCircle(circle: Address): Promise<boolean> {
  for (const address of FACTORIES) {
    if (await publicClient.readContract({ address, abi: factoryAbi, functionName: "isCircle", args: [circle] })) return true;
  }
  return false;
}

/// The join payment's nonce. Circles from the first factory bind it to the member alone; later ones also count rejoins.
async function joinNonceFor(circle: Address, member: Address): Promise<Hex> {
  try {
    return await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "joinNonce", args: [member] });
  } catch {
    return nonceFor(circle, JOIN, member);
  }
}

export type PaymentRecord = { paid: number; missed: number; finished: number; finishedClean: number };

/// A member's payment record across every circle the current factory made. Circles from earlier factories kept none.
export async function readRecord(member: Address): Promise<PaymentRecord> {
  const r = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "recordOf", args: [member] });
  return { paid: Number(r.paid), missed: Number(r.missed), finished: Number(r.finished), finishedClean: Number(r.finishedClean) };
}

/// Early-slot terms of a circle; circles from earlier factories have none.
export async function readEarlySlots(circle: Address): Promise<{ earlySlots: number; minPaid: number }> {
  try {
    const [earlySlots, minPaid] = await Promise.all([
      publicClient.readContract({ address: circle, abi: circleAbi, functionName: "earlySlots" }),
      publicClient.readContract({ address: circle, abi: circleAbi, functionName: "minPaid" }),
    ]);
    return { earlySlots: Number(earlySlots), minPaid: Number(minPaid) };
  } catch {
    return { earlySlots: 0, minPaid: 0 };
  }
}

/// Whether a record clears a circle's early-slot bar (Circle.join's rule).
export const clearsEarlySlot = (r: PaymentRecord, minPaid: number) => r.paid >= minPaid && r.missed === 0;

// ---------- signatures ----------

const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function split(sig: Hex): Sig {
  const { v, r, s } = hexToSignature(sig);
  return { v: Number(v), r, s };
}

/// Nonce the circle binds an authorization to (Circle.nonceFor).
export function nonceFor(circle: Address, round: bigint, member: Address): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, address"), [circle, round, member]));
}

/// Nonce for the organiser's next guarantee top-up (Circle.bondNonce).
export function bondNonce(circle: Address, bondAdds: bigint): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("address, string, uint256"), [circle, "bond", bondAdds]));
}

/// One ERC-3009 receiveWithAuthorization: the member's money moves only when the circle itself submits it.
export async function signReceive(
  account: LocalAccount,
  to: Address,
  value: bigint,
  validBefore: bigint,
  nonce: Hex,
): Promise<Sig> {
  const sig = await account.signTypedData({
    domain: TOKEN_DOMAIN,
    types: receiveTypes,
    primaryType: "ReceiveWithAuthorization",
    message: { from: account.address, to, value, validAfter: 0n, validBefore, nonce },
  });
  return split(sig);
}

/// The invite key in the link admits one member to one slot (Circle.inviteDigest, EIP-191).
export async function signInvite(inviteKey: Hex, circle: Address, slot: bigint, member: Address): Promise<Sig> {
  const inner = keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, address"), [circle, slot, member]));
  return split(await privateKeyToAccount(inviteKey).signMessage({ message: { raw: inner } }));
}

export function newInviteKey(): { key: Hex; signer: Address } {
  const key = generatePrivateKey();
  return { key, signer: privateKeyToAccount(key).address };
}

/// Everything a join needs, from one unlock: the invite, round 0 plus the set-aside now, and a standing order for every
/// later round.
export async function joinBundle(account: LocalAccount, inviteKey: Hex, circle: Snapshot, slot: number) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const payValidBefore = now + 3600n;
  const invite = await signInvite(inviteKey, circle.address, BigInt(slot), account.address);
  const pay = await signReceive(account, circle.address, 2n * circle.contribution, payValidBefore, await joinNonceFor(circle.address, account.address));
  const rounds: Sig[] = [];
  for (let r = 1n; r < circle.size; r++) {
    rounds.push(await signReceive(account, circle.address, circle.contribution, MAX, nonceFor(circle.address, r, account.address)));
  }
  return { circle: circle.address, slot, member: account.address, invite, payValidBefore: payValidBefore.toString(), pay, rounds };
}

export async function bondBundle(account: LocalAccount, circle: Address, amount: bigint) {
  const bondAdds = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "bondAdds" });
  const validBefore = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const sig = await signReceive(account, circle, amount, validBefore, bondNonce(circle, bondAdds));
  return { circle, amount: amount.toString(), validBefore: validBefore.toString(), sig };
}

export async function contributeBundle(account: LocalAccount, circle: Snapshot) {
  const validBefore = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const sig = await signReceive(account, circle.address, circle.contribution, validBefore, nonceFor(circle.address, circle.round, account.address));
  return { circle: circle.address, member: account.address, validBefore: validBefore.toString(), sig };
}

/// Leave a circle that has not filled yet: everything paid in comes back. Signs Circle.leaveDigest's inner hash.
export async function leaveBundle(account: LocalAccount, circle: Address) {
  const joins = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "joins", args: [account.address] });
  const inner = keccak256(encodeAbiParameters(parseAbiParameters("address, string, address, uint256"), [circle, "leave", account.address, joins]));
  return { circle, member: account.address, sig: split(await account.signMessage({ message: { raw: inner } })) };
}

/// The organiser takes her guarantee back before the circle fills. Signs Circle.bondExitDigest's inner hash.
export async function unbondBundle(account: LocalAccount, circle: Address) {
  const bondAdds = await publicClient.readContract({ address: circle, abi: circleAbi, functionName: "bondAdds" });
  const inner = keccak256(encodeAbiParameters(parseAbiParameters("address, string, uint256"), [circle, "bond-exit", bondAdds]));
  return { circle, sig: split(await account.signMessage({ message: { raw: inner } })) };
}

// ---------- relayer ----------

export type Relayed = { hash: Hex; circle?: Address };

/// POSTs to the relayer and returns only once the transaction is mined successfully. A hash alone is an accepted
/// request; the caller still reads the circle back to confirm the effect.
export async function relay(path: string, body: unknown, base = process.env.NEXT_PUBLIC_RELAYER ?? ""): Promise<Relayed> {
  const res = await fetch(`${base}/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Relayed & { error?: string };
  if (!res.ok || !data.hash) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

// ---------- invite links ----------

/// /c/?id=<circle>#k=<invite key>. The key rides in the fragment, which browsers never send to any server.
export function inviteLink(origin: string, circle: Address, inviteKey: Hex): string {
  return `${origin}/c/?id=${circle}#k=${inviteKey.slice(2)}`;
}

export function parseCircleLocation(search: string, hash: string): { circle: Address | null; inviteKey: Hex | null } {
  const id = new URLSearchParams(search).get("id");
  const k = new URLSearchParams(hash.replace(/^#/, "")).get("k");
  return {
    circle: id && /^0x[0-9a-fA-F]{40}$/.test(id) ? (id as Address) : null,
    inviteKey: k && /^[0-9a-fA-F]{64}$/.test(k) ? (`0x${k}` as Hex) : null,
  };
}
