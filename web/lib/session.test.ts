import { describe, expect, test } from "bun:test";
import { loadCircles, saveCircle, saveCircles } from "./session";

const OWNER = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const OTHER = "0x0000000000000000000000000000000000000002" as `0x${string}`;

test("circle history is deduplicated and isolated by passkey address", () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) }, configurable: true });
  saveCircle(OWNER, OTHER);
  saveCircle(OWNER, OTHER);
  expect(loadCircles(OWNER)).toEqual([OTHER]);
  saveCircles(OWNER, [OTHER, OTHER.toLowerCase() as `0x${string}`]);
  expect(loadCircles(OWNER)).toEqual([OTHER]);
  expect(loadCircles("0x0000000000000000000000000000000000000003" as `0x${string}`)).toEqual([]);
});
