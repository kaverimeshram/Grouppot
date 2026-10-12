// What this phone remembers: who "you" are on a circle page, and the invite link's key on the organiser's own phone.
// Neither is a secret that moves money. The account itself is never stored; it is rebuilt from the phone lock.
import type { Address, Hex, LocalAccount } from "viem";
import { copy } from "./copy";
import { cancelled, NoPasskeyHere } from "./errors";
import { createPasskeyAccount, signInWithPasskey } from "./passkey";

export type Me = { address: Address; name: string };

const ME = "grouppot:me";
const INVITE = "grouppot:invite:";
const CIRCLES = "grouppot:circles:";

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

export function loadCircles(owner: Address): Address[] {
  const raw = read(CIRCLES + owner.toLowerCase());
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown;
    return Array.isArray(values) ? values.filter((v): v is Address => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) : [];
  } catch {
    return [];
  }
}

export function saveCircle(owner: Address, circle: Address): void {
  const circles = loadCircles(owner);
  if (!circles.some((v) => v.toLowerCase() === circle.toLowerCase())) write(CIRCLES + owner.toLowerCase(), JSON.stringify([...circles, circle]));
}

export function saveCircles(owner: Address, circles: Address[]): void {
  const verified = [...new Map(circles.map((circle) => [circle.toLowerCase(), circle])).values()];
  write(CIRCLES + owner.toLowerCase(), JSON.stringify(verified));
}

export const sameAddress = (a: string | undefined | null, b: string | undefined | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/// One phone-lock prompt. First timers create the account, returning people open the one they have.
export async function unlock(name: string, returning: boolean): Promise<{ address: Address; account: LocalAccount }> {
  let got;
  try {
    got = returning ? await signInWithPasskey() : await createPasskeyAccount(name);
  } catch (e) {
    if (returning && cancelled(e)) throw new NoPasskeyHere(copy.error.noPasskeyHere);
    throw e;
  }
  saveMe({ address: got.address, name });
  return got;
}
