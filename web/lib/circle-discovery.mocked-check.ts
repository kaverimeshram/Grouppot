import { expect, mock, test } from "bun:test";
import type { Address } from "viem";

const OWNER = "0x0000000000000000000000000000000000000001" as Address;
const OTHER = "0x0000000000000000000000000000000000000002" as Address;
const FACTORY = "0x0000000000000000000000000000000000000003" as Address;
const CIRCLE = "0x0000000000000000000000000000000000000004" as Address;

mock.module("./chain", () => ({
  FACTORIES: [FACTORY],
  publicClient: {
    readContract: async ({ functionName }: { functionName: string }) => functionName === "count" ? 1n : [CIRCLE],
    multicall: async () => [{ name: "Owner circle", organiser: OWNER, members: [] }],
  },
}));

const { discoverCircles } = await import("./circle-discovery");

test("discovery includes the same owner and excludes a nonmember", async () => {
  expect(await discoverCircles(OWNER)).toEqual([{ address: CIRCLE, name: "Owner circle" }]);
  expect(await discoverCircles(OTHER)).toEqual([]);
});
