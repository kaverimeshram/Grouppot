// A circle snapshot as JSON: bigints travel as {"$bigint":"123"} so a label that looks like a number stays a label.
import type { Snapshot } from "../web/lib/chain";

export const stringify = (s: Snapshot, space?: number) =>
  JSON.stringify(s, (_, v) => (typeof v === "bigint" ? { $bigint: v.toString() } : v), space);

export const parse = (text: string): Snapshot =>
  JSON.parse(text, (_, v) => (v && typeof v === "object" && typeof v.$bigint === "string" ? BigInt(v.$bigint) : v)) as Snapshot;
