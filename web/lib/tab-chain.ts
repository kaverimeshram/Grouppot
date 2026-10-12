import {
  createPublicClient,
  encodeAbiParameters,
  hexToSignature,
  http,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { tabAbi } from "./tab-abi";
import { TAB_DEPLOYMENT } from "./tab-deployment";
import { DECIMALS, TOKEN, TOKEN_DOMAIN, chain, dollars, relay, toUnits, type Sig } from "./chain";

export const TAB_FACTORY = TAB_DEPLOYMENT.factory as Address;

export const tabClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { retryCount: 4, retryDelay: 400 }) });

export type TabSnapshot = Awaited<ReturnType<typeof readTab>>;

export { dollars, toUnits };

export async function readTab(tab: Address) {
  const v = await tabClient.readContract({ address: tab, abi: tabAbi, functionName: "snapshot" });
  return { ...v, address: tab };
}

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

export function settleNonce(tab: Address, member: Address): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("string, address, address"), ["crew-settle", tab, member]));
}

export async function signSettle(account: LocalAccount, amount: bigint, tab: Address): Promise<Sig & { validBefore: string; nonce: Hex }> {
  const validBefore = BigInt(Math.floor(Date.now() / 1000)) + BigInt(3600);
  const nonce = settleNonce(tab, account.address);
  const sig = await account.signTypedData({
    domain: TOKEN_DOMAIN,
    types: receiveTypes,
    primaryType: "ReceiveWithAuthorization",
    message: { from: account.address, to: tab, value: amount, validAfter: BigInt(0), validBefore, nonce },
  });
  return { ...split(sig), validBefore: validBefore.toString(), nonce };
}

export async function settleBundle(account: LocalAccount, tab: TabSnapshot) {
  const me = tab.members.find((m) => m.member.toLowerCase() === account.address.toLowerCase());
  if (!me) throw new Error("you are not on this tab");
  if (me.paid) throw new Error("you already settled");
  const signed = await signSettle(account, me.share, tab.address);
  return {
    tab: tab.address,
    member: account.address,
    validAfter: "0",
    validBefore: signed.validBefore,
    nonce: signed.nonce,
    sig: { v: signed.v, r: signed.r, s: signed.s },
  };
}

export function equalShares(total: bigint, count: number): bigint[] {
  if (count <= 0) throw new Error("add at least one friend");
  const base = total / BigInt(count);
  const rem = total % BigInt(count);
  const out: bigint[] = [];
  for (let i = 0; i < count; i++) out.push(base + (i < Number(rem) ? BigInt(1) : BigInt(0)));
  return out;
}

export async function createTabRelay(
  host: Address,
  name: string,
  itemLabel: string,
  totalDollars: number,
  members: { address: Address; label: string }[],
) {
  const total = toUnits(totalDollars);
  const shares = equalShares(total, members.length);
  const res = await relay("tab/create", {
    name,
    host,
    itemLabels: [itemLabel],
    itemAmounts: [total.toString()],
    members: members.map((m) => m.address),
    labels: members.map((m) => m.label),
    shares: shares.map((s) => s.toString()),
  });
  if (!res.tab) throw new Error("tab not returned");
  return { hash: res.hash, tab: res.tab };
}

export async function tabPracticeRelay(who: Address, tab: Address) {
  return relay("tab/practice", { address: who, tab });
}

export async function tabSettleRelay(body: Awaited<ReturnType<typeof settleBundle>>) {
  return relay("tab/settle", body);
}

export { TOKEN, DECIMALS };
