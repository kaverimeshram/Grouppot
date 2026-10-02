// The pinned real snapshots, and a way to cut a "previous" state from one by editing a copy.
import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "../../web/lib/chain";
import { parse, stringify } from "../snapshot";

export const CLOSED = "0x2b0cb7ea1c4f58e9bacb442adc8b07b8cfd3056f";
export const SATURDAY = "0x4e1afdcfae179debac986830b10473c3fd88f6f3";

export function fixture(circle: string): { snapshot: Snapshot; block: string } {
  const j = JSON.parse(fs.readFileSync(path.join(import.meta.dir, `${circle}.json`), "utf8")) as { block: string; snapshot: unknown };
  return { snapshot: parse(JSON.stringify(j.snapshot)), block: j.block };
}

/// A deep copy of `s` with `change` applied.
export function edit(s: Snapshot, change: (c: Snapshot) => void): Snapshot {
  const c = parse(stringify(s));
  change(c);
  return c;
}
