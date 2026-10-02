// Passkey sign-in for circle members (Category Labs Mera).
//
// Browser only. No seed phrase is ever shown: the WebAuthn PRF output becomes
// BIP-39 entropy in memory, derives m/44'/60'/0'/0/0, and backs a secp256k1
// signing session that viem signs through without further prompts. Nothing is
// persisted: no localStorage, no cookies, no vault. The PRF output, seed and
// private key copies are zeroed once the session owns its key; the session
// itself lives only as long as the returned LocalAccount is held.
//
// Follows the library's own recipes exactly:
// docs "send-a-transaction-with-viem" (getPasskeyPrfOutput with
// rpId location.hostname, entropyToMnemonic/mnemonicToSeedSync seed,
// HDKey m/44'/60'/0'/0/0, createSecp256k1SigningSession, toViemAccount from
// "@category-labs/mera/viem") and "create-passkey-accounts"
// (createPasskeyWithPrfOutput for first-time users).
import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getPasskeyPrfOutput } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Address, LocalAccount } from "viem";

// First Ethereum account under BIP-44, the same path the Mera recipe uses.
const ETHEREUM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

function browserRelyingPartyId(): string {
  if (typeof window === "undefined" || typeof location === "undefined") {
    throw new Error("passkey sign-in is browser only; call it from a client component or an event handler");
  }
  return location.hostname;
}

// Pure derivation: 32-byte PRF output to the first Ethereum account. Runs
// anywhere (including bun tests) because it never touches WebAuthn. The input
// is not stored and not mutated; intermediate seed and key copies are zeroed.
export function accountFromPrfOutput(prfOutput: Uint8Array): { address: Address; account: LocalAccount } {
  if (!(prfOutput instanceof Uint8Array) || prfOutput.length !== 32) {
    throw new Error("PRF output must be 32 bytes");
  }
  // The mnemonic is never displayed, saved or returned: it exists only to
  // turn the PRF output into a BIP-39 seed for this call.
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(ETHEREUM_ACCOUNT_PATH);
  seed.fill(0);
  const privateKey = node.privateKey;
  if (privateKey === null) {
    throw new Error("derivation produced no key");
  }
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  const account = toViemAccount(session);
  return { address: account.address, account };
}

// Returning member: one assertion ceremony, one user-verification prompt, and
// the browser may offer any discoverable credential for this relying party.
export async function signInWithPasskey(): Promise<{ address: Address; account: LocalAccount }> {
  const rpId = browserRelyingPartyId();
  const { prfOutput } = await getPasskeyPrfOutput({ rpId });
  try {
    return accountFromPrfOutput(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
}

// First-time member: creates a new passkey (one creation ceremony, one
// prompt, with a fallback assertion on authenticators that skip PRF at
// creation) and derives the same first account from its first PRF output.
// `name` labels the credential in the authenticator UI only.
export async function createPasskeyAccount(name: string): Promise<{ address: Address; account: LocalAccount }> {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("name this passkey so the authenticator can label it");
  }
  const rpId = browserRelyingPartyId();
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "grouppot" },
    user: { name: trimmed, displayName: trimmed },
  });
  try {
    return accountFromPrfOutput(created.prfOutput);
  } finally {
    created.prfOutput.fill(0);
  }
}
