// What this phone remembers: who "you" are on a circle page, and the invite link's key on the organiser's own phone.
// Neither is a secret that moves money. The account itself is never stored; it is rebuilt from the phone lock.
import type { Address, Hex, LocalAccount } from "viem";
import { createPasskeyAccount, signInWithPasskey } from "./passkey";

export type Me = { address: Address; name: string };

const ME = "grouppot:me";
const INVITE = "grouppot:invite:";

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private browsing: the page still works, this phone just forgets who you are
  }
}

export function loadMe(): Me | null {
  const raw = read(ME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Me;
    return /^0x[0-9a-fA-F]{40}$/.test(v.address) && typeof v.name === "string" ? v : null;
  } catch {
    return null;
  }
}
export const saveMe = (me: Me) => write(ME, JSON.stringify(me));

export const loadInvite = (circle: Address): Hex | null => {
  const k = read(INVITE + circle.toLowerCase());
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null;
};
export const saveInvite = (circle: Address, key: Hex) => write(INVITE + circle.toLowerCase(), key);

export const sameAddress = (a: string | undefined | null, b: string | undefined | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/// One phone-lock prompt. First timers create the account, returning people open the one they have.
export async function unlock(name: string, returning: boolean): Promise<{ address: Address; account: LocalAccount }> {
  const got = returning ? await signInWithPasskey() : await createPasskeyAccount(name);
  saveMe({ address: got.address, name });
  return got;
}
